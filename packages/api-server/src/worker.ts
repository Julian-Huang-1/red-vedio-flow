import { randomUUID } from 'node:crypto'
import type { NodeResult, QueueJob } from '@red-video-flow/workflow-core'
import { ProviderBoundaryError } from '@red-video-flow/workflow-runtime/network-provider'
import type { DurableRuntime } from './runtime.js'
import { persistGeneratedResultResources } from './resultPersistence.js'
import {
  appendRunEvent,
  completeNodeRun,
  emitProviderEvent,
  failNodeRun,
  requireRun,
  updateTrace,
} from './runService.js'
import { executeWorkflowRun } from './workflowExecutor.js'

const leaseMs = 60_000

export class DurableWorker {
  private readonly workerId = `cowork-worker-${process.pid}-${randomUUID()}`
  private readonly controller = new AbortController()
  private readonly loops: Promise<void>[] = []

  constructor(private readonly runtime: DurableRuntime) {}

  start() {
    if (this.loops.length) return
    for (let index = 0; index < this.runtime.config.workerConcurrency; index += 1) {
      this.loops.push(this.loop())
    }
  }

  async stop() {
    this.controller.abort()
    await Promise.all(this.loops)
  }

  private async loop() {
    await this.runtime.infrastructure.jobs.recoverExpired()
    while (!this.controller.signal.aborted) {
      const job = await this.runtime.infrastructure.jobs.claim(this.workerId, leaseMs)
      if (!job) {
        await this.runtime.infrastructure.jobs.waitForWork(this.controller.signal)
        continue
      }
      await this.execute(job)
    }
  }

  private async execute(job: QueueJob) {
    const heartbeat = setInterval(() => {
      void this.runtime.infrastructure.jobs.heartbeat(job.id, this.workerId, leaseMs)
    }, leaseMs / 3)
    heartbeat.unref()
    try {
      const runId = typeof job.payload.runId === 'string' ? job.payload.runId : undefined
      if (!runId) throw new Error(`${job.type} job is missing runId`)
      if (job.type === 'execute-node') await this.executeNode(runId)
      else if (job.type === 'schedule-workflow') await executeWorkflowRun(this.runtime, runId)
      else throw new Error(`unsupported job type: ${job.type}`)
      await this.runtime.infrastructure.jobs.complete(job.id, this.workerId)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      await this.runtime.infrastructure.jobs.fail(
        job.id,
        this.workerId,
        message,
        Date.now() + Math.min(30_000, 1_000 * 2 ** job.attempts),
      )
      const runId = typeof job.payload.runId === 'string' ? job.payload.runId : undefined
      if (runId && job.type === 'execute-node') {
        await failNodeRun(this.runtime, runId, {
          code: error instanceof ProviderBoundaryError ? error.code : 'worker_execution_failed',
          message,
          retryable: error instanceof ProviderBoundaryError
            ? error.retryable
            : job.attempts < job.maxAttempts,
        })
        const failedRun = await requireRun(this.runtime, runId)
        await patchWorkflowNodeExecution(
          this.runtime,
          failedRun.workflowId,
          failedRun.nodeId,
          runId,
          'error',
        )
      }
    } finally {
      clearInterval(heartbeat)
    }
  }

  private async executeNode(runId: string) {
    const run = await requireRun(this.runtime, runId)
    if (!['queued', 'running'].includes(run.status)) return
    const now = Date.now()
    await this.runtime.infrastructure.workflowRuns.save({
      ...run,
      status: 'running',
      providerId: run.inputSnapshot!.model.providerId,
      updatedAt: now,
      heartbeatAt: now,
    })
    await appendRunEvent(this.runtime, runId, 'run', {
      type: 'run',
      status: 'running',
      runId,
    })
    await patchWorkflowNodeExecution(
      this.runtime,
      run.workflowId,
      run.nodeId,
      runId,
      'running',
    )
    const token = await this.runtime.infrastructure.credentials.getModelToken(run.userId!)
    if (!token) throw new ProviderBoundaryError('credential_missing', 'model API token is not configured', false)
    const provider = this.runtime.providers.resolve(
      run.inputSnapshot!.model.providerId,
      run.kind === 'image' || run.kind === 'video' ? run.kind : 'text',
    )
    const result = await provider.execute(run.inputSnapshot!, {
      runId,
      workflowId: run.workflowId,
      nodeId: run.nodeId,
      userId: run.userId!,
      token,
      signal: this.controller.signal,
      blobs: this.runtime.infrastructure.blobs,
      emit: (event) => emitProviderEvent(this.runtime, runId, event),
      trace: {
        recordProviderInput: async (providerInput) => {
          await updateTrace(this.runtime, runId, { providerInput })
        },
        recordNetworkRequest: async (request) => {
          const current = await requireRun(this.runtime, runId)
          await updateTrace(this.runtime, runId, {
            networkRequests: [...(current.trace?.networkRequests ?? []), request],
          })
        },
        recordResponse: async (response) => {
          await updateTrace(this.runtime, runId, { response })
        },
      },
    })
    await persistGeneratedResultResources({
      resources: {
        save: (resource, blobId) => (
          this.runtime.infrastructure.postgresResources.save(resource, blobId)
        ),
        bind: (input) => this.runtime.infrastructure.postgresResources.bind(input),
      },
      workflowId: run.workflowId,
      nodeId: run.nodeId,
      runId,
      results: result.results,
    })
    await appendResultsToWorkflow(
      this.runtime,
      run.workflowId,
      run.nodeId,
      runId,
      result.results,
    )
    await completeNodeRun(
      this.runtime,
      runId,
      result.results,
      result.providerTaskId,
      result.providerResponseId,
    )
  }
}

async function appendResultsToWorkflow(
  runtime: DurableRuntime,
  workflowId: string,
  nodeId: string,
  runId: string,
  results: NodeResult[],
) {
  for (const result of results) {
    await appendResultToWorkflow(runtime, workflowId, nodeId, runId, result)
  }
}

async function appendResultToWorkflow(
  runtime: DurableRuntime,
  workflowId: string,
  nodeId: string,
  runId: string,
  result: NodeResult,
) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const workflow = await runtime.infrastructure.postgresWorkflows.get(workflowId)
    if (!workflow) throw new Error(`workflow not found: ${workflowId}`)
    try {
      await runtime.infrastructure.postgresWorkflows.patch({
        id: workflowId,
        baseRevision: workflow.revision,
        ops: [
          { type: 'setNodeLatestRun', nodeId, runId },
          { type: 'appendNodeResult', nodeId, result, makeCurrent: true },
          { type: 'setNodeStatus', nodeId, status: 'done' },
        ],
      })
      return
    } catch {
      if (attempt === 2) throw new Error(`unable to append result to workflow: ${workflowId}`)
    }
  }
}

async function patchWorkflowNodeExecution(
  runtime: DurableRuntime,
  workflowId: string,
  nodeId: string,
  runId: string,
  status: 'running' | 'error',
) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const workflow = await runtime.infrastructure.postgresWorkflows.get(workflowId)
    if (!workflow) throw new Error(`workflow not found: ${workflowId}`)
    try {
      await runtime.infrastructure.postgresWorkflows.patch({
        id: workflowId,
        baseRevision: workflow.revision,
        ops: [
          { type: 'setNodeLatestRun', nodeId, runId },
          { type: 'setNodeStatus', nodeId, status },
        ],
      })
      return
    } catch {
      if (attempt === 2) throw new Error(`unable to update workflow node execution: ${workflowId}`)
    }
  }
}
