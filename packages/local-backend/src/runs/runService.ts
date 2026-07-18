import type { MaterialValue, NodeStatus } from '@red-video-flow/workflow-core'
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
  constructor(
    private readonly repository: RunRepository,
    private readonly workflows: WorkflowService,
  ) {}

  get(runId: string) {
    return this.repository.get(runId)
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

    const patched = this.workflows.patch({
      id: input.workflowId,
      baseRevision: input.baseRevision ?? workflow.revision,
      ops: [
        { type: 'setNodeStatus', nodeId: input.nodeId, status: input.status ?? 'done' },
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

    const patched = this.workflows.patch({
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
