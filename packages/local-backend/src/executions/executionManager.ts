import { EventEmitter } from 'node:events'
import { randomUUID } from 'node:crypto'
import type { ExecutionEvent, ExecutionEventType } from '@red-video-flow/plugin-contract'
import type { PluginManager } from '../plugins/pluginManager.js'
import { PluginRequestTimeoutError } from '../plugins/processHost.js'
import {
  ExecutionRepository,
  type ExecutionKind,
  type ExecutionRecord,
  type ExecutionStatus,
} from './executionRepository.js'

const terminalStatuses = new Set<ExecutionStatus>([
  'succeeded',
  'failed',
  'cancelled',
  'timed_out',
  'interrupted',
])

export type StartPluginExecutionInput = {
  pluginId: string
  contributionId: string
  kind: ExecutionKind
  method: string
  input?: unknown
  timeoutMs?: number
}

export type ExecutionManagerOptions = {
  maxBufferedEvents?: number
  defaultTimeoutMs?: number
}

export class ExecutionManager {
  private readonly events = new EventEmitter()
  private readonly eventBuffers = new Map<string, ExecutionEvent[]>()
  private readonly sequence = new Map<string, number>()
  private readonly active = new Map<string, { pluginId: string }>()
  private readonly removePluginNotificationListener: () => void
  private draining = false

  constructor(
    private readonly repository: ExecutionRepository,
    private readonly plugins: PluginManager,
    private readonly options: ExecutionManagerOptions = {},
  ) {
    this.events.setMaxListeners(0)
    this.removePluginNotificationListener = plugins.onNotification((event) => {
      if (event.method !== 'execution.event') return
      this.acceptPluginEvent(event.pluginId, event.params)
    })
  }

  bootstrap() {
    const now = Date.now()
    for (const execution of this.repository.listActive()) {
      this.repository.save({
        ...execution,
        status: 'interrupted',
        errorCode: 'SERVER_RESTARTED',
        errorMessage: 'Local server restarted while the execution was active.',
        updatedAt: now,
        finishedAt: now,
      })
    }
  }

  startCommand(commandId: string, input?: unknown, timeoutMs?: number) {
    const registered = this.plugins.contributions.getCommand(commandId)
    if (!registered) throw new Error(`command not found: ${commandId}`)
    return this.start({
      pluginId: registered.pluginId,
      contributionId: commandId,
      kind: 'command',
      method: 'command.execute',
      input,
      timeoutMs,
    })
  }

  startNodeExecutor(executorId: string, input?: unknown, timeoutMs?: number) {
    const registered = this.plugins.contributions.getNodeExecutor(executorId)
    if (!registered) throw new Error(`node executor not found: ${executorId}`)
    return this.start({
      pluginId: registered.pluginId,
      contributionId: executorId,
      kind: 'node',
      method: 'node.execute',
      input,
      timeoutMs,
    })
  }

  start(input: StartPluginExecutionInput) {
    if (this.draining) throw new Error('execution manager is shutting down')
    const now = Date.now()
    const execution: ExecutionRecord = {
      id: createExecutionId(),
      pluginId: input.pluginId,
      contributionId: input.contributionId,
      kind: input.kind,
      status: 'queued',
      input: input.input,
      createdAt: now,
      updatedAt: now,
    }
    this.repository.save(execution)
    this.active.set(execution.id, { pluginId: input.pluginId })
    queueMicrotask(() => {
      void this.run(execution.id, input)
    })
    return execution
  }

  get(executionId: string) {
    return this.repository.get(executionId)
  }

  getEvents(executionId: string, afterSequence = 0) {
    return (this.eventBuffers.get(executionId) ?? [])
      .filter((event) => event.sequence > afterSequence)
  }

  subscribe(
    executionId: string,
    listener: (event: ExecutionEvent) => void,
    afterSequence = 0,
  ) {
    for (const event of this.getEvents(executionId, afterSequence)) listener(event)
    const eventName = `execution:${executionId}`
    this.events.on(eventName, listener)
    return () => this.events.off(eventName, listener)
  }

  async cancel(executionId: string) {
    const execution = this.requireExecution(executionId)
    if (terminalStatuses.has(execution.status)) return execution
    try {
      await this.plugins.call(
        execution.pluginId,
        'execution.cancel',
        { executionId },
        5_000,
      )
    } catch {}
    return this.finish(executionId, 'cancelled', undefined, {
      code: 'EXECUTION_CANCELLED',
      message: 'Execution was cancelled.',
    })
  }

  async close() {
    if (this.draining) return
    this.draining = true
    await Promise.allSettled([...this.active.keys()].map((executionId) => this.cancel(executionId)))
    this.removePluginNotificationListener()
  }

  private async run(executionId: string, input: StartPluginExecutionInput) {
    let execution = this.requireExecution(executionId)
    if (terminalStatuses.has(execution.status)) return
    const now = Date.now()
    execution = this.repository.save({
      ...execution,
      status: 'running',
      startedAt: now,
      updatedAt: now,
    })
    this.emit(executionId, 'started', {
      pluginId: input.pluginId,
      contributionId: input.contributionId,
      kind: input.kind,
    })

    try {
      const result = await this.plugins.call(
        input.pluginId,
        input.method,
        {
          executionId,
          contributionId: input.contributionId,
          input: input.input,
        },
        input.timeoutMs ?? this.options.defaultTimeoutMs,
      )
      const latest = this.requireExecution(executionId)
      if (!terminalStatuses.has(latest.status)) this.finish(executionId, 'succeeded', result)
    } catch (error) {
      const latest = this.requireExecution(executionId)
      if (terminalStatuses.has(latest.status)) return
      if (error instanceof PluginRequestTimeoutError) {
        await this.cancelPluginExecution(executionId, input.pluginId)
        this.finish(executionId, 'timed_out', undefined, {
          code: 'EXECUTION_TIMED_OUT',
          message: error.message,
        })
      } else {
        this.finish(executionId, 'failed', undefined, {
          code: readErrorCode(error),
          message: error instanceof Error ? error.message : String(error),
        })
      }
    }
  }

  private acceptPluginEvent(pluginId: string, value: unknown) {
    if (!isRecord(value) || typeof value.executionId !== 'string' || typeof value.type !== 'string') return
    const active = this.active.get(value.executionId)
    if (!active || active.pluginId !== pluginId) return
    if (!isPluginExecutionEventType(value.type)) return
    this.emit(value.executionId, value.type, value.data)
  }

  private finish(
    executionId: string,
    status: Extract<ExecutionStatus, 'succeeded' | 'failed' | 'cancelled' | 'timed_out'>,
    result?: unknown,
    error?: { code: string; message: string },
  ) {
    const current = this.requireExecution(executionId)
    if (terminalStatuses.has(current.status)) return current
    const now = Date.now()
    const next = this.repository.save({
      ...current,
      status,
      result,
      errorCode: error?.code,
      errorMessage: error?.message,
      updatedAt: now,
      finishedAt: now,
    })
    this.active.delete(executionId)
    this.emit(
      executionId,
      status === 'succeeded'
        ? 'completed'
        : status === 'cancelled'
          ? 'cancelled'
          : 'failed',
      status === 'succeeded' ? { result } : error,
    )
    return next
  }

  private emit(executionId: string, type: ExecutionEventType, data?: unknown) {
    const event: ExecutionEvent = {
      executionId,
      sequence: (this.sequence.get(executionId) ?? 0) + 1,
      timestamp: Date.now(),
      type,
      data,
    }
    this.sequence.set(executionId, event.sequence)
    const buffer = this.eventBuffers.get(executionId) ?? []
    buffer.push(event)
    const max = this.options.maxBufferedEvents ?? 200
    if (buffer.length > max) buffer.splice(0, buffer.length - max)
    this.eventBuffers.set(executionId, buffer)
    this.events.emit(`execution:${executionId}`, event)
  }

  private requireExecution(executionId: string) {
    const execution = this.repository.get(executionId)
    if (!execution) throw new Error(`execution not found: ${executionId}`)
    return execution
  }

  private async cancelPluginExecution(executionId: string, pluginId: string) {
    try {
      await this.plugins.call(pluginId, 'execution.cancel', { executionId }, 5_000)
    } catch {}
  }
}

function createExecutionId() {
  return `exec-${randomUUID()}`
}

function readErrorCode(error: unknown) {
  if (isRecord(error) && isRecord(error.rpcError) && typeof error.rpcError.code === 'string') {
    return error.rpcError.code
  }
  return 'EXECUTION_FAILED'
}

function isPluginExecutionEventType(
  value: string,
): value is Extract<ExecutionEventType, 'delta' | 'stderr' | 'progress' | 'submitted'> {
  return ['delta', 'stderr', 'progress', 'submitted'].includes(value)
}

function isRecord(value: unknown): value is Record<string, any> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}
