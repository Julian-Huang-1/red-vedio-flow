import { isDeepStrictEqual } from 'node:util'
import { basename, join } from 'node:path'
import type {
  MaterialMessage,
  MaterialNode,
  MaterialValue,
  NodeRunInput,
  WorkflowPatchOperation,
} from '@red-video-flow/workflow-core'
import type { AssetService } from '../assets/assetService.js'
import type { NodeResultProjector } from '../runs/nodeResultProjector.js'
import type { RunService } from '../runs/runService.js'
import type { WorkflowService } from '../workflows/workflowService.js'
import type { VisualRunResult, VisualServiceContract } from './service.js'
import {
  VisualTaskRepository,
  type VisualTaskRecord,
  type VisualTaskRecordStatus,
} from './taskRepository.js'

export type VisualTaskServiceOptions = {
  pollIntervalMs?: number
  imageTimeoutMs?: number
  videoTimeoutMs?: number
  leaseDurationMs?: number
}

export type StartVisualTaskInput = {
  runId?: string
  workflowId: string
  nodeId: string
  provider: string
  nodeKind: 'image' | 'video'
  inputSnapshot?: NodeRunInput
  modelId?: string
}

export type VisualTaskReconcileResult = {
  claimed: number
  completed: number
  pending: number
  failed: number
}

const terminalStatuses = new Set<VisualTaskRecordStatus>(['succeeded', 'failed', 'timed_out', 'cancelled'])

export class VisualTaskService {
  private readonly pollIntervalMs: number
  private readonly imageTimeoutMs: number
  private readonly videoTimeoutMs: number
  private readonly leaseDurationMs: number

  constructor(
    private readonly repository: VisualTaskRepository,
    private readonly workflows: WorkflowService,
    private readonly visual: VisualServiceContract,
    private readonly assets: AssetService,
    private readonly runs: RunService,
    private readonly nodeResults: NodeResultProjector,
    options: VisualTaskServiceOptions = {},
  ) {
    this.pollIntervalMs = options.pollIntervalMs ?? 5_000
    this.imageTimeoutMs = options.imageTimeoutMs ?? 10 * 60_000
    this.videoTimeoutMs = options.videoTimeoutMs ?? 30 * 60_000
    this.leaseDurationMs = options.leaseDurationMs ?? 60_000
  }

  get(id: string) {
    return this.repository.get(id)
  }

  findBySubmitId(provider: string, submitId: string) {
    return this.repository.findBySubmitId(provider, submitId)
  }

  findByRunId(runId: string) {
    return this.repository.findByRunId(runId)
  }

  cancelNodeRun(runId: string) {
    const task = this.repository.findByRunId(runId)
    if (!task || terminalStatuses.has(task.status)) return task
    const now = Date.now()
    return this.repository.save({
      ...task,
      status: 'cancelled',
      leaseOwner: undefined,
      leaseExpiresAt: undefined,
      updatedAt: now,
      completedAt: now,
      projectedAt: now,
    })
  }

  start(input: StartVisualTaskInput) {
    const workflow = this.workflows.get(input.workflowId)
    if (!workflow) throw new Error(`workflow not found: ${input.workflowId}`)
    const node = workflow.graph.nodes.find((candidate) => candidate.id === input.nodeId)
    if (!node) throw new Error(`node not found: ${input.nodeId}`)
    if (node.data.materialType !== input.nodeKind) throw new Error('visual task node kind does not match workflow node')

    const now = Date.now()
    const active = this.repository.findActiveForNode(input.workflowId, input.nodeId)
    if (active) {
      this.repository.save({
        ...active,
        status: 'cancelled',
        leaseOwner: undefined,
        leaseExpiresAt: undefined,
        updatedAt: now,
        completedAt: now,
        projectedAt: now,
      })
      if (active.runId) this.runs.cancelNodeRun(active.runId)
    }

    const task: VisualTaskRecord = {
      id: createVisualTaskId(),
      runId: input.runId,
      workflowId: input.workflowId,
      nodeId: input.nodeId,
      provider: input.provider,
      nodeKind: input.nodeKind,
      inputSnapshot: input.inputSnapshot,
      modelId: input.modelId,
      status: 'submitting',
      attemptCount: 0,
      nextPollAt: now,
      timeoutAt: now + (input.nodeKind === 'image' ? this.imageTimeoutMs : this.videoTimeoutMs),
      createdAt: now,
      updatedAt: now,
    }
    return this.repository.save(task)
  }

  async startNodeRun(runId: string) {
    const run = this.runs.getNodeRun(runId)
    if (!run) throw new Error(`node run not found: ${runId}`)
    if (run.inputSnapshot.generationConfig.type !== 'openai-image'
      && run.inputSnapshot.generationConfig.type !== 'volc-video') {
      throw new Error('node run is not a visual generation')
    }
    const existing = this.repository.findByRunId(runId)
    if (existing) return existing

    this.runs.markNodeRunRunning(runId)
    const task = this.start({
      runId,
      workflowId: run.workflowId,
      nodeId: run.nodeId,
      provider: run.inputSnapshot.model.modelId,
      modelId: run.inputSnapshot.model.modelId,
      nodeKind: run.inputSnapshot.generationConfig.type === 'openai-image' ? 'image' : 'video',
      inputSnapshot: run.inputSnapshot,
    })

    try {
      const result = await this.visual.invoke({
        executionId: task.id,
        idempotencyKey: runId,
        modelId: run.inputSnapshot.model.modelId,
        nodeKind: task.nodeKind,
        prompt: run.inputSnapshot.prompt,
        upstream: await this.upstreamNodes(run.inputSnapshot),
        providerOptions: generationConfigOptions(run.inputSnapshot),
        downloadDir: join(this.assets.generatedDir, runId),
        assetUrlForPath: (filePath) => this.assets.assetUrlForPath(filePath),
        onEvent: (event) => {
          if (event.type === 'meta') {
            this.markSubmitted(task.id, event.submitId)
            this.runs.attachNodeProviderTask(runId, {
              providerId: run.inputSnapshot.model.providerId,
              taskId: event.submitId,
            })
          }
          if (event.type === 'partial-image') {
            this.runs.appendNodeRunEvent(runId, 'image_partial', {
              type: 'image_partial',
              runId,
              index: event.index,
              base64: event.base64,
              mimeType: event.mimeType,
            })
          }
        },
      })
      return this.recordInitialResult(task.id, result)
    } catch (error) {
      return this.failSubmission(task.id, error)
    }
  }

  markSubmitted(taskId: string, submitId: string) {
    const task = this.requireTask(taskId)
    if (terminalStatuses.has(task.status)) return task
    const duplicate = this.repository.findBySubmitId(task.provider, submitId)
    if (duplicate && duplicate.id !== task.id) {
      if (duplicate.workflowId !== task.workflowId || duplicate.nodeId !== task.nodeId) {
        throw new Error(`visual submitId already belongs to another node: ${submitId}`)
      }
      const now = Date.now()
      this.repository.save({
        ...task,
        status: 'cancelled',
        leaseOwner: undefined,
        leaseExpiresAt: undefined,
        updatedAt: now,
        completedAt: now,
        projectedAt: now,
      })
      return duplicate
    }

    const now = Date.now()
    const submitted = this.repository.save({
      ...task,
      submitId,
      status: 'polling',
      nextPollAt: now + this.pollIntervalMs,
      leaseOwner: undefined,
      leaseExpiresAt: undefined,
      lastError: undefined,
      updatedAt: now,
    })
    this.projectSubmitted(submitted)
    return submitted
  }

  recordInitialResult(taskId: string, result: VisualRunResult) {
    let task = this.requireTask(taskId)
    if (result.submitId && task.submitId !== result.submitId) task = this.markSubmitted(task.id, result.submitId)
    if (terminalStatuses.has(task.status)) return task
    return this.applyProviderResult(task, result, false)
  }

  failSubmission(taskId: string, error: unknown) {
    const task = this.requireTask(taskId)
    if (terminalStatuses.has(task.status)) return task
    const message = error instanceof Error ? error.message : String(error)
    if (task.status === 'polling' && task.submitId) {
      const now = Date.now()
      return this.repository.save({
        ...task,
        nextPollAt: now + retryDelayMs(task.attemptCount + 1, this.pollIntervalMs),
        leaseOwner: undefined,
        leaseExpiresAt: undefined,
        lastError: message,
        updatedAt: now,
      })
    }
    return this.finish(task, 'failed', undefined, `视觉任务提交失败：${message}`, message)
  }

  bootstrap() {
    const now = Date.now()
    let imported = 0

    for (const task of this.repository.listActive()) {
      if (task.status === 'submitting') {
        this.finish(task, 'failed', undefined, '服务重启时视觉任务尚未完成提交，请重新生成。', 'submission interrupted')
      } else {
        this.projectSubmitted(task)
      }
    }

    for (const workflow of this.workflows.list()) {
      for (const node of workflow.graph.nodes) {
        const submitId = node.data.value.submitId
        if (
          node.data.status !== 'running'
          || (node.data.materialType !== 'image' && node.data.materialType !== 'video')
          || !submitId
        ) {
          continue
        }
        const provider = node.data.value.provider ?? 'dreamina'
        if (this.repository.findBySubmitId(provider, submitId)) continue
        const active = this.repository.findActiveForNode(workflow.id, node.id)
        if (active) {
          this.repository.save({
            ...active,
            status: 'cancelled',
            leaseOwner: undefined,
            leaseExpiresAt: undefined,
            updatedAt: now,
            completedAt: now,
            projectedAt: now,
          })
        }
        const task: VisualTaskRecord = {
          id: createVisualTaskId(),
          workflowId: workflow.id,
          nodeId: node.id,
          provider,
          nodeKind: node.data.materialType,
          submitId,
          status: 'polling',
          attemptCount: 0,
          nextPollAt: now,
          timeoutAt: now + (node.data.materialType === 'image' ? this.imageTimeoutMs : this.videoTimeoutMs),
          createdAt: now,
          updatedAt: now,
        }
        this.repository.save(task)
        imported += 1
      }
    }

    for (const task of this.repository.listUnprojectedTerminal()) this.projectTerminal(task)
    return { imported }
  }

  async reconcileDue(input: { owner: string; now?: number; limit?: number }): Promise<VisualTaskReconcileResult> {
    const now = input.now ?? Date.now()
    const due = this.repository.listDue(now, input.limit ?? 4)
    const claimed = due.filter((task) =>
      this.repository.claim(task.id, input.owner, now, now + this.leaseDurationMs),
    )
    const outcomes = await Promise.allSettled(
      claimed.map((task) => this.reconcileClaimed(task.id, input.owner, now)),
    )

    return outcomes.reduce<VisualTaskReconcileResult>((summary, outcome) => {
      summary.claimed += 1
      if (outcome.status === 'rejected') {
        summary.failed += 1
        return summary
      }
      if (outcome.value === 'completed') summary.completed += 1
      if (outcome.value === 'pending') summary.pending += 1
      if (outcome.value === 'failed') summary.failed += 1
      return summary
    }, { claimed: 0, completed: 0, pending: 0, failed: 0 })
  }

  private async reconcileClaimed(
    taskId: string,
    owner: string,
    now: number,
  ): Promise<'completed' | 'pending' | 'failed'> {
    const task = this.requireTask(taskId)
    if (task.status !== 'polling' || task.leaseOwner !== owner) return 'pending'
    if (now >= task.timeoutAt) {
      const finished = this.finish(
        task,
        'timed_out',
        task.result,
        '视觉任务等待超时，请重新生成。',
        'visual task timed out',
        owner,
      )
      return finished.status === 'timed_out' ? 'failed' : 'pending'
    }
    if (!task.submitId) {
      const finished = this.finish(
        task,
        'failed',
        task.result,
        '视觉任务缺少 submitId，无法继续查询。',
        'submitId is missing',
        owner,
      )
      return finished.status === 'failed' ? 'failed' : 'pending'
    }

    try {
      const result = await this.visual.query({
        executionId: task.id,
        submitId: task.submitId,
        providerId: task.provider,
        nodeKind: task.nodeKind,
        downloadDir: join(this.assets.generatedDir, `task-${task.submitId}`),
        assetUrlForPath: (filePath) => this.assets.assetUrlForPath(filePath),
      })
      const nextTask = this.requireTask(task.id)
      if (nextTask.status !== 'polling' || nextTask.leaseOwner !== owner) return 'pending'
      const applied = this.applyProviderResult({
        ...nextTask,
        attemptCount: nextTask.attemptCount + 1,
      }, result, true, owner)
      return applied.status === 'polling' ? 'pending' : applied.status === 'succeeded' ? 'completed' : 'failed'
    } catch (error) {
      const latest = this.requireTask(task.id)
      if (latest.status !== 'polling' || latest.leaseOwner !== owner) return 'pending'
      const attemptCount = latest.attemptCount + 1
      this.repository.saveClaimed({
        ...latest,
        attemptCount,
        nextPollAt: Date.now() + retryDelayMs(attemptCount, this.pollIntervalMs),
        leaseOwner: undefined,
        leaseExpiresAt: undefined,
        lastError: error instanceof Error ? error.message : String(error),
        updatedAt: Date.now(),
      }, owner)
      return 'pending'
    }
  }

  private applyProviderResult(
    task: VisualTaskRecord,
    result: VisualRunResult,
    fromPoll: boolean,
    leaseOwner?: string,
  ) {
    if (terminalStatuses.has(task.status)) return task
    const succeeded = Boolean(result.url || result.assets?.some((asset) => asset.url))
      && result.taskStatus !== 'failed'
    if (succeeded) {
      if (!task.runId && result.localPath && result.url) {
        this.assets.register({
          workflowId: task.workflowId,
          kind: task.nodeKind,
          url: result.url,
          localPath: result.localPath,
          fileName: result.fileName ?? basename(result.localPath),
          mimeType: result.mimeType,
          provider: task.provider,
        })
      }
      return this.finish(
        task,
        'succeeded',
        result,
        `视觉任务 ${task.submitId ?? task.id} 已完成。`,
        undefined,
        leaseOwner,
      )
    }
    if (result.taskStatus === 'failed' || result.taskStatus === 'success') {
      const message = result.failReason || (result.taskStatus === 'success'
        ? `视觉任务 ${task.submitId ?? task.id} 已成功，但没有返回可用媒体。`
        : `视觉任务 ${task.submitId ?? task.id} 失败${result.genStatus ? `：${result.genStatus}` : ''}。`)
      return this.finish(task, 'failed', result, message, result.failReason, leaseOwner)
    }

    const now = Date.now()
    const pending: VisualTaskRecord = {
      ...task,
      status: 'polling',
      result,
      nextPollAt: now + (fromPoll ? pendingDelayMs(task.attemptCount, this.pollIntervalMs) : this.pollIntervalMs),
      leaseOwner: undefined,
      leaseExpiresAt: undefined,
      lastError: undefined,
      updatedAt: now,
    }
    if (!leaseOwner) return this.repository.save(pending)
    return this.repository.saveClaimed(pending, leaseOwner) ?? this.requireTask(task.id)
  }

  private finish(
    task: VisualTaskRecord,
    status: Extract<VisualTaskRecordStatus, 'succeeded' | 'failed' | 'timed_out'>,
    result: VisualRunResult | undefined,
    message: string,
    lastError?: string,
    leaseOwner?: string,
  ) {
    const now = Date.now()
    const nextTask: VisualTaskRecord = {
      ...task,
      status,
      result,
      leaseOwner: undefined,
      leaseExpiresAt: undefined,
      lastError,
      updatedAt: now,
      completedAt: now,
      projectedAt: undefined,
    }
    const finished = leaseOwner
      ? this.repository.saveClaimed(nextTask, leaseOwner)
      : this.repository.save(nextTask)
    if (!finished) return this.requireTask(task.id)
    this.projectTerminal(finished, message)
    return this.requireTask(task.id)
  }

  private projectSubmitted(task: VisualTaskRecord) {
    if (!task.submitId || task.status !== 'polling') return
    if (task.runId) {
      const run = this.runs.getNodeRun(task.runId)
      if (run && !run.providerTask?.taskId) {
        this.runs.attachNodeProviderTask(task.runId, {
          providerId: run.inputSnapshot.model.providerId,
          taskId: task.submitId,
        })
      }
      return
    }
    const active = this.repository.findActiveForNode(task.workflowId, task.nodeId)
    if (active?.id !== task.id) return
    const workflow = this.workflows.get(task.workflowId)
    const node = workflow?.graph.nodes.find((candidate) => candidate.id === task.nodeId)
    if (!workflow || !node) return

    const value: MaterialValue = {
      ...node.data.value,
      text: `已提交视觉生成任务：${task.submitId}`,
      url: undefined,
      localPath: undefined,
      fileName: undefined,
      mimeType: undefined,
      submitId: task.submitId,
      provider: task.provider,
    }
    const message = createTaskMessage(task, 'submitted', `已提交视觉生成任务：${task.submitId}`)
    this.patchNodeIfNeeded(workflow.id, node, 'running', value, message)
  }

  private projectTerminal(task: VisualTaskRecord, explicitMessage?: string) {
    if (task.runId) {
      if (task.status === 'succeeded' && task.result) {
        this.nodeResults.projectVisual(task.runId, task.result)
      } else {
        this.nodeResults.fail(task.runId, {
          code: task.status,
          message: explicitMessage ?? task.lastError ?? '视觉任务未能完成。',
          retryable: task.status !== 'cancelled',
          status: task.status === 'timed_out' ? 'timed_out' : 'failed',
        })
      }
      this.markProjected(task)
      return
    }
    const workflow = this.workflows.get(task.workflowId)
    const node = workflow?.graph.nodes.find((candidate) => candidate.id === task.nodeId)
    const newerTask = this.repository.findActiveForNode(task.workflowId, task.nodeId)
    if (
      !workflow
      || !node
      || (newerTask && newerTask.id !== task.id)
      || (task.submitId && node.data.value.submitId !== task.submitId)
      || (!task.submitId && node.data.status !== 'running')
    ) {
      this.markProjected(task)
      return
    }

    const succeeded = task.status === 'succeeded' && Boolean(task.result?.url)
    const status = succeeded ? 'done' as const : 'error' as const
    const message = explicitMessage ?? (succeeded
      ? `视觉任务 ${task.submitId ?? task.id} 已完成。`
      : task.lastError || `视觉任务 ${task.submitId ?? task.id} 未能完成。`)
    const value: MaterialValue = succeeded
      ? {
          ...node.data.value,
          text: undefined,
          url: task.result?.url,
          localPath: task.result?.localPath,
          fileName: task.result?.fileName,
          mimeType: task.result?.mimeType,
          submitId: task.submitId,
          provider: task.provider,
        }
      : {
          ...node.data.value,
          text: message,
          submitId: task.submitId,
          provider: task.provider,
        }
    this.patchNodeIfNeeded(
      workflow.id,
      node,
      status,
      value,
      createTaskMessage(task, 'completed', message),
    )
    this.markProjected(task)
  }

  private patchNodeIfNeeded(
    workflowId: string,
    node: MaterialNode,
    status: MaterialNode['data']['status'],
    value: MaterialValue,
    message: MaterialMessage,
  ) {
    const workflow = this.workflows.get(workflowId)
    if (!workflow) return
    const latestNode = workflow.graph.nodes.find((candidate) => candidate.id === node.id)
    if (!latestNode) return
    const ops: WorkflowPatchOperation[] = []
    if (latestNode.data.status !== status) ops.push({ type: 'setNodeStatus', nodeId: node.id, status })
    if (!isDeepStrictEqual(latestNode.data.value, value)) ops.push({ type: 'setNodeValue', nodeId: node.id, value })
    if (!latestNode.data.messages.some((item) => item.id === message.id)) {
      ops.push({ type: 'appendNodeMessage', nodeId: node.id, message })
    }
    if (ops.length) this.workflows.patch({ id: workflowId, baseRevision: workflow.revision, ops })
  }

  private markProjected(task: VisualTaskRecord) {
    const latest = this.repository.get(task.id)
    if (!latest || latest.projectedAt) return
    this.repository.save({ ...latest, projectedAt: Date.now(), updatedAt: Date.now() })
  }

  private requireTask(id: string) {
    const task = this.repository.get(id)
    if (!task) throw new Error(`visual task not found: ${id}`)
    return task
  }

  private async upstreamNodes(input: NodeRunInput) {
    const inputs = [
      ...input.attachments,
      ...input.upstreamResults.flatMap((result) => result.assets),
    ]
    return inputs.map((asset, index) => {
      const localPath = asset.url.startsWith('/api/assets/')
        ? this.assets.resolveAssetPath(asset.url)
        : undefined
      return {
        id: `input-${index}`,
        position: { x: 0, y: 0 },
        data: {
          materialType: asset.kind,
          title: asset.name ?? `Input ${index + 1}`,
          status: 'done',
          value: {
            localPath,
            url: /^https?:\/\//.test(asset.url) ? asset.url : undefined,
            fileName: asset.name,
            mimeType: asset.mimeType,
          },
          messages: [],
        },
      }
    })
  }
}

function generationConfigOptions(input: NodeRunInput) {
  const {
    type: _type,
    version: _version,
    providerOptions,
    previousResponseId: _previousResponseId,
    ...options
  } = input.generationConfig as NodeRunInput['generationConfig'] & {
    previousResponseId?: string
  }
  return { ...options, ...providerOptions }
}

function createVisualTaskId() {
  return `visual-task-${Date.now()}-${Math.round(Math.random() * 10_000)}`
}

function createTaskMessage(task: VisualTaskRecord, phase: 'submitted' | 'completed', text: string): MaterialMessage {
  return {
    id: `visual-task:${task.id}:${phase}`,
    role: 'assistant',
    text,
    createdAt: Date.now(),
  }
}

function pendingDelayMs(attemptCount: number, baseMs: number) {
  if (attemptCount < 12) return baseMs
  return Math.min(30_000, baseMs * 3)
}

function retryDelayMs(attemptCount: number, baseMs: number) {
  return Math.min(30_000, baseMs * (2 ** Math.min(3, Math.max(0, attemptCount - 1))))
}
