import { EventEmitter } from 'node:events'
import type {
  MaterialValue,
  NodeResult,
  NodeRun,
  NodeRunInput,
  NodeStatus,
} from '@red-video-flow/workflow-core'
import { isDeepStrictEqual } from 'node:util'
import type { WorkflowService } from '../workflows/workflowService.js'
import type { RunRepository, WorkflowRun } from './runRepository.js'

export type StartRunInput = {
  workflowId: string
  nodeId: string
  prompt: string
  baseRevision?: number
}

export type FinishRunInput = {
  workflowId: string
  nodeId: string
  runId: string
  baseRevision?: number
  value?: MaterialValue
  status?: Extract<NodeStatus, 'done' | 'running'>
  message: string
}

export type ReapTimedOutRunsOptions = {
  timeoutMs: number
  now?: number
}

export class WorkflowRunError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'WorkflowRunError'
  }
}

export class RunService {
  private readonly events = new EventEmitter()

  constructor(
    private readonly repository: RunRepository,
    private readonly workflows: WorkflowService,
  ) {}

  get(runId: string) {
    return this.repository.get(runId)
  }

  getNodeRun(runId: string) {
    const run = this.repository.get(runId)
    return run?.inputSnapshot ? toNodeRun(run) : undefined
  }

  listNodeRuns(workflowId: string) {
    return this.repository.listByWorkflow(workflowId)
      .filter((run) => run.inputSnapshot)
      .map(toNodeRun)
  }

  listRecoverableNodeRuns() {
    return this.repository.listByStatuses(['queued', 'running'])
      .filter((run) => run.inputSnapshot)
      .map(toNodeRun)
  }

  createNodeRun(input: {
    id?: string
    workflowId: string
    nodeId: string
    input: NodeRunInput
  }) {
    if (input.id) {
      const existing = this.repository.get(input.id)
      if (existing?.inputSnapshot) {
        if (existing.workflowId !== input.workflowId || existing.nodeId !== input.nodeId) {
          throw new WorkflowRunError(`run id already belongs to another node: ${input.id}`)
        }
        return toNodeRun(existing)
      }
    }
    const workflow = this.workflows.get(input.workflowId)
    if (!workflow) throw new WorkflowRunError(`workflow not found: ${input.workflowId}`)
    const node = workflow.graph.nodes.find((item) => item.id === input.nodeId)
    if (!node) throw new WorkflowRunError(`node not found: ${input.nodeId}`)
    const now = Date.now()
    const run: WorkflowRun = {
      id: input.id ?? createRunId(),
      workflowId: input.workflowId,
      nodeId: input.nodeId,
      kind: node.data.materialType,
      status: 'queued',
      prompt: input.input.prompt,
      inputSnapshot: input.input,
      resultIds: [],
      createdAt: now,
      updatedAt: now,
      startedAt: now,
      heartbeatAt: now,
    }
    this.repository.save(run)
    this.emit(run.id, 'run', { type: 'run', status: 'queued', runId: run.id })
    return toNodeRun(run)
  }

  markNodeRunRunning(runId: string) {
    const run = this.requireNodeRun(runId)
    if (run.status === 'running') return toNodeRun(run)
    const workflow = this.workflows.get(run.workflowId)
    if (!workflow) throw new WorkflowRunError(`workflow not found: ${run.workflowId}`)
    const patched = this.workflows.patch({
      id: run.workflowId,
      baseRevision: workflow.revision,
      ops: [
        { type: 'setNodeLatestRun', nodeId: run.nodeId, runId },
        { type: 'setNodeStatus', nodeId: run.nodeId, status: 'running' },
      ],
    })
    const now = Date.now()
    const next = this.repository.save({
      ...run,
      status: 'running',
      updatedAt: now,
      heartbeatAt: now,
      startedAt: run.startedAt || now,
    })
    this.emit(runId, 'run', {
      type: 'run',
      status: 'running',
      runId,
      workflowRevision: patched.revision,
    })
    return toNodeRun(next)
  }

  attachNodeProviderTask(runId: string, input: {
    providerId: string
    taskId?: string
    responseId?: string
  }) {
    const run = this.requireNodeRun(runId)
    const next = this.repository.save({
      ...run,
      providerId: input.providerId,
      providerTaskId: input.taskId,
      providerResponseId: input.responseId,
      updatedAt: Date.now(),
      heartbeatAt: Date.now(),
    })
    this.emit(runId, 'run', {
      type: 'run',
      status: 'running',
      runId,
      providerTask: input,
    })
    return toNodeRun(next)
  }

  completeNodeRun(runId: string, results: NodeResult[], workflowRevision?: number) {
    const run = this.requireNodeRun(runId)
    if (run.status === 'succeeded') return toNodeRun(run)
    const now = Date.now()
    const resultIds = results.map((result) => result.id)
    const next = this.repository.save({
      ...run,
      status: 'succeeded',
      resultIds,
      result: results,
      updatedAt: now,
      heartbeatAt: now,
      finishedAt: now,
    })
    for (const result of results) {
      this.emit(runId, 'result', { type: 'result', runId, result })
    }
    this.emit(runId, 'done', {
      type: 'done',
      runId,
      resultIds,
      workflowRevision,
    })
    return toNodeRun(next)
  }

  failNodeRun(runId: string, input: {
    code?: string
    message: string
    retryable: boolean
    status?: 'failed' | 'timed_out' | 'interrupted'
  }) {
    const run = this.requireNodeRun(runId)
    if (['succeeded', 'failed', 'cancelled', 'timed_out', 'interrupted'].includes(run.status)) {
      return toNodeRun(run)
    }
    const workflow = this.workflows.get(run.workflowId)
    const patched = workflow
      ? this.workflows.patch({
          id: run.workflowId,
          baseRevision: workflow.revision,
          ops: [{ type: 'setNodeStatus', nodeId: run.nodeId, status: 'error' }],
        })
      : undefined
    const now = Date.now()
    const next = this.repository.save({
      ...run,
      status: input.status ?? 'failed',
      error: input.message,
      errorCode: input.code,
      errorRetryable: input.retryable,
      updatedAt: now,
      heartbeatAt: now,
      finishedAt: now,
    })
    this.emit(runId, 'error', {
      type: 'error',
      runId,
      code: input.code,
      message: input.message,
      retryable: input.retryable,
      workflowRevision: patched?.revision,
    })
    return toNodeRun(next)
  }

  cancelNodeRun(runId: string) {
    const run = this.requireNodeRun(runId)
    if (!['queued', 'running'].includes(run.status)) return toNodeRun(run)
    const workflow = this.workflows.get(run.workflowId)
    if (workflow) {
      this.workflows.patch({
        id: run.workflowId,
        baseRevision: workflow.revision,
        ops: [{ type: 'setNodeStatus', nodeId: run.nodeId, status: 'ready' }],
      })
    }
    const now = Date.now()
    const next = this.repository.save({
      ...run,
      status: 'cancelled',
      updatedAt: now,
      heartbeatAt: now,
      finishedAt: now,
    })
    this.emit(runId, 'error', {
      type: 'error',
      runId,
      code: 'cancelled',
      message: '任务已取消',
      retryable: false,
    })
    return toNodeRun(next)
  }

  appendNodeRunEvent(runId: string, type: string, data: unknown) {
    return this.emit(runId, type, data)
  }

  listNodeRunEvents(runId: string, after = 0) {
    return this.repository.listEvents(runId, after)
  }

  subscribeNodeRun(runId: string, listener: (event: ReturnType<RunRepository['appendEvent']>) => void) {
    const eventName = `run:${runId}`
    this.events.on(eventName, listener)
    return () => this.events.off(eventName, listener)
  }

  start(input: StartRunInput) {
    const workflow = this.workflows.get(input.workflowId)
    if (!workflow) throw new WorkflowRunError(`workflow not found: ${input.workflowId}`)
    if (!workflow.graph.nodes.some((node) => node.id === input.nodeId)) {
      throw new WorkflowRunError(`node not found: ${input.nodeId}`)
    }

    const now = Date.now()
    const run: WorkflowRun = {
      id: createRunId(),
      workflowId: input.workflowId,
      nodeId: input.nodeId,
      status: 'running',
      prompt: input.prompt,
      startedAt: now,
      heartbeatAt: now,
    }

    const patched = this.workflows.patch({
      id: input.workflowId,
      baseRevision: input.baseRevision ?? workflow.revision,
      ops: [
        { type: 'setNodeStatus', nodeId: input.nodeId, status: 'running' },
        {
          type: 'appendNodeMessage',
          nodeId: input.nodeId,
          message: {
            id: `msg-${now}-user`,
            role: 'user',
            text: input.prompt,
            createdAt: now,
          },
        },
      ],
    })

    return { run: this.repository.save(run), workflow: patched }
  }

  heartbeat(workflowId: string, nodeId: string, runId: string) {
    const run = this.assertRunningRun(workflowId, nodeId, runId)
    return this.repository.save({ ...run, heartbeatAt: Date.now() })
  }

  complete(input: FinishRunInput) {
    const run = this.assertRunningRun(input.workflowId, input.nodeId, input.runId)
    const workflow = this.workflows.get(input.workflowId)
    if (!workflow) throw new WorkflowRunError(`workflow not found: ${input.workflowId}`)
    const now = Date.now()

    const node = workflow.graph.nodes.find((candidate) => candidate.id === input.nodeId)
    const targetStatus = input.status ?? 'done'
    const alreadyApplied = Boolean(input.value?.submitId)
      && node?.data.messages.some((message) => message.id.startsWith('visual-task:'))
      && node.data.status === targetStatus
      && (!input.value || isDeepStrictEqual(node.data.value, input.value))
    const patched = alreadyApplied
      ? workflow
      : this.workflows.patch({
          id: input.workflowId,
          baseRevision: input.baseRevision ?? workflow.revision,
          ops: [
            { type: 'setNodeStatus', nodeId: input.nodeId, status: targetStatus },
            ...(input.value ? [{ type: 'setNodeValue' as const, nodeId: input.nodeId, value: input.value }] : []),
            {
              type: 'appendNodeMessage',
              nodeId: input.nodeId,
              message: {
                id: `msg-${now}-assistant`,
                role: 'assistant',
                text: input.message,
                createdAt: now,
              },
            },
          ],
        })

    const nextRun = this.repository.save({
      ...run,
      status: 'done',
      result: input.value,
      heartbeatAt: now,
      finishedAt: now,
    })
    return { run: nextRun, workflow: patched }
  }

  fail(input: FinishRunInput) {
    const run = this.assertRunningRun(input.workflowId, input.nodeId, input.runId)
    const workflow = this.workflows.get(input.workflowId)
    if (!workflow) throw new WorkflowRunError(`workflow not found: ${input.workflowId}`)
    const now = Date.now()

    const node = workflow.graph.nodes.find((candidate) => candidate.id === input.nodeId)
    const alreadyApplied = Boolean(node?.data.value.submitId)
      && node?.data.messages.some((message) => message.id.startsWith('visual-task:') && message.id.endsWith(':completed'))
      && node.data.status === 'error'
    const patched = alreadyApplied
      ? workflow
      : this.workflows.patch({
          id: input.workflowId,
          baseRevision: input.baseRevision ?? workflow.revision,
          ops: [
            { type: 'setNodeStatus', nodeId: input.nodeId, status: 'error' },
            {
              type: 'appendNodeMessage',
              nodeId: input.nodeId,
              message: {
                id: `msg-${now}-assistant`,
                role: 'assistant',
                text: input.message,
                createdAt: now,
              },
            },
          ],
        })

    const nextRun = this.repository.save({
      ...run,
      status: 'error',
      error: input.message,
      heartbeatAt: now,
      finishedAt: now,
    })
    return { run: nextRun, workflow: patched }
  }

  reapTimedOutRuns(options: ReapTimedOutRunsOptions) {
    const now = options.now ?? Date.now()
    const timedOut = this.repository
      .listRunning()
      .filter((run) => !run.inputSnapshot)
      .filter((run) => now - run.heartbeatAt >= options.timeoutMs)
    const reaped: WorkflowRun[] = []

    for (const run of timedOut) {
      const workflow = this.workflows.get(run.workflowId)
      if (!workflow) {
        reaped.push(this.repository.save(markRunTimedOut(run, now, '工作流不存在，运行已超时')))
        continue
      }

      const node = workflow.graph.nodes.find((item) => item.id === run.nodeId)
      const message = `Agent 执行超时：${Math.round((now - run.heartbeatAt) / 1000)} 秒未收到心跳，已自动结束。`

      if (node?.data.status === 'running') {
        this.workflows.patch({
          id: run.workflowId,
          baseRevision: workflow.revision,
          ops: [
            { type: 'setNodeStatus', nodeId: run.nodeId, status: 'error' },
            {
              type: 'appendNodeMessage',
              nodeId: run.nodeId,
              message: {
                id: `msg-${now}-timeout`,
                role: 'assistant',
                text: message,
                createdAt: now,
              },
            },
          ],
        })
      }

      reaped.push(this.repository.save(markRunTimedOut(run, now, message)))
    }

    return reaped
  }

  private assertRunningRun(workflowId: string, nodeId: string, runId: string) {
    const run = this.repository.get(runId)
    if (!run) throw new WorkflowRunError(`run not found: ${runId}`)
    if (run.workflowId !== workflowId || run.nodeId !== nodeId) throw new WorkflowRunError('run does not belong to this node')
    if (run.status !== 'running') throw new WorkflowRunError(`run is not running: ${run.status}`)
    return run
  }

  private requireNodeRun(runId: string) {
    const run = this.repository.get(runId)
    if (!run?.inputSnapshot) throw new WorkflowRunError(`node run not found: ${runId}`)
    return run
  }

  private emit(runId: string, type: string, data: unknown) {
    const event = this.repository.appendEvent(runId, type, data)
    this.events.emit(`run:${runId}`, event)
    return event
  }
}

function createRunId() {
  return `run-${Date.now()}-${Math.round(Math.random() * 10000)}`
}

function markRunTimedOut(run: WorkflowRun, now: number, message: string): WorkflowRun {
  return {
    ...run,
    status: 'timeout',
    error: message,
    finishedAt: now,
  }
}

function toNodeRun(run: WorkflowRun): NodeRun {
  return {
    id: run.id,
    workflowId: run.workflowId,
    nodeId: run.nodeId,
    status: normalizeNodeRunStatus(run.status),
    inputSnapshot: run.inputSnapshot!,
    providerTask: run.providerId
      ? {
          providerId: run.providerId,
          taskId: run.providerTaskId,
          responseId: run.providerResponseId,
        }
      : undefined,
    resultIds: run.resultIds ?? [],
    error: run.error
      ? {
          code: run.errorCode,
          message: run.error,
          retryable: run.errorRetryable ?? false,
        }
      : undefined,
    createdAt: run.createdAt ?? run.startedAt,
    updatedAt: run.updatedAt ?? run.heartbeatAt,
    startedAt: run.startedAt,
    finishedAt: run.finishedAt,
  }
}

function normalizeNodeRunStatus(status: WorkflowRun['status']): NodeRun['status'] {
  if (status === 'done') return 'succeeded'
  if (status === 'error') return 'failed'
  if (status === 'timeout') return 'timed_out'
  return status
}
