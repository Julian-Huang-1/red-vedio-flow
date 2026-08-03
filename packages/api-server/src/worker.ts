import { randomUUID } from 'node:crypto'
import type { NodeResult, ProviderExecutionResult, QueueJob } from '@red-video-flow/workflow-core'
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
    this.loops.push(this.watchdog())
  }

  async stop() {
    this.controller.abort()
    await Promise.all(this.loops)
  }

  private async loop() {
    while (!this.controller.signal.aborted) {
      try {
        const job = await this.runtime.infrastructure.jobs.claim(this.workerId, leaseMs)
        if (!job) {
          await this.runtime.infrastructure.jobs.waitForWork(this.controller.signal)
          continue
        }
        await this.execute(job)
      } catch {
        if (this.controller.signal.aborted) return
        await this.runtime.infrastructure.jobs.waitForWork(this.controller.signal).catch(() => undefined)
      }
    }
  }

  private async watchdog() {
    while (!this.controller.signal.aborted) {
      const recovered = await this.runtime.infrastructure.jobs.recoverExpiredJobs().catch(() => [])
      for (const job of recovered) {
        if (job.status !== 'failed') continue
        try {
          await this.finalizeExhaustedLease(job.type, job.payload)
          await this.runtime.infrastructure.jobs.completeExpiredFinalization(job.id)
        } catch {
          // The failed job remains marked for finalization and is retried by
          // the next watchdog pass.
        }
      }
      await abortableWait(5_000, this.controller.signal)
    }
  }

  private async finalizeExhaustedLease(
    type: QueueJob['type'],
    payload: Record<string, unknown>,
  ) {
    const runId = typeof payload.runId === 'string' ? payload.runId : undefined
    if (!runId) return
    const message = 'worker lease expired and retry attempts were exhausted'
    if (type === 'execute-node') {
      await failNodeRun(this.runtime, runId, {
        code: 'worker_lease_exhausted',
        message,
        retryable: false,
      })
      const run = await requireRun(this.runtime, runId)
      await patchWorkflowNodeExecution(
        this.runtime,
        run.workflowId,
        run.nodeId,
        runId,
        'error',
      )
      return
    }
    if (type === 'schedule-workflow') {
      const run = await this.runtime.infrastructure.postgresWorkflowAppRuns.get<any>(runId)
      if (!run || !['queued', 'running'].includes(run.status)) return
      const now = Date.now()
      run.status = 'failed'
      run.error = message
      run.updatedAt = now
      run.events = Array.isArray(run.events) ? run.events : []
      run.events.push({
        id: run.events.length + 1,
        type: 'failed',
        message,
        createdAt: now,
      })
      await this.runtime.infrastructure.postgresWorkflowAppRuns.save(run)
    }
  }

  private async execute(job: QueueJob) {
    let leaseLost = false
    const heartbeat = setInterval(() => {
      void this.runtime.infrastructure.jobs.heartbeat(job.id, this.workerId, leaseMs)
        .then((renewed) => { if (!renewed) leaseLost = true })
        .catch(() => { leaseLost = true })
    }, leaseMs / 3)
    heartbeat.unref()
    try {
      const runId = typeof job.payload.runId === 'string' ? job.payload.runId : undefined
      if (!runId) throw new Error(`${job.type} job is missing runId`)
      const assertLease = async () => {
        if (leaseLost) {
          throw new ProviderBoundaryError('worker_lease_lost', 'worker lease was lost', true)
        }
        const renewed = await this.runtime.infrastructure.jobs.heartbeat(
          job.id,
          this.workerId,
          leaseMs,
        )
        if (!renewed) {
          leaseLost = true
          throw new ProviderBoundaryError('worker_lease_lost', 'worker lease was lost', true)
        }
      }
      if (job.type === 'execute-node') await this.executeNode(runId, assertLease)
      else if (job.type === 'schedule-workflow') {
        await executeWorkflowRun(this.runtime, runId, assertLease)
      }
      else throw new Error(`unsupported job type: ${job.type}`)
      await assertLease()
      await this.runtime.infrastructure.jobs.complete(job.id, this.workerId)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      const runId = typeof job.payload.runId === 'string' ? job.payload.runId : undefined
      const currentRun = runId && job.type === 'execute-node'
        ? await requireRun(this.runtime, runId)
        : undefined
      if (currentRun && ['done', 'succeeded'].includes(currentRun.status)) {
        await this.runtime.infrastructure.jobs.complete(job.id, this.workerId)
        return
      }
      const resumableNodeRun = Boolean(
        currentRun?.providerTaskId
        || (Array.isArray(currentRun?.result) && currentRun.result.length),
      )
      const errorAllowsRetry = error instanceof ProviderBoundaryError
        ? error.retryable
        : true
      const canRetry = job.attempts < job.maxAttempts
        && errorAllowsRetry
        && (job.type !== 'execute-node' || resumableNodeRun)
      if (runId && job.type === 'execute-node') {
        if (canRetry) {
          await this.runtime.infrastructure.workflowRuns.save({
            ...currentRun!,
            status: 'queued',
            error: message,
            errorCode: error instanceof ProviderBoundaryError ? error.code : 'worker_execution_failed',
            errorRetryable: true,
            updatedAt: Date.now(),
            heartbeatAt: Date.now(),
            finishedAt: undefined,
          })
          await appendRunEvent(this.runtime, runId, 'retry_scheduled', {
            type: 'retry_scheduled',
            runId,
            attempt: job.attempts + 1,
            providerTaskId: currentRun!.providerTaskId,
            message,
          })
        }
      }
      await this.runtime.infrastructure.jobs.fail(
        job.id,
        this.workerId,
        message,
        canRetry ? Date.now() + Math.min(30_000, 1_000 * 2 ** job.attempts) : undefined,
      )
      if (runId && job.type === 'execute-node' && !canRetry) {
          await failNodeRun(this.runtime, runId, {
            code: error instanceof ProviderBoundaryError ? error.code : 'worker_execution_failed',
            message,
            retryable: false,
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

  private async executeNode(runId: string, assertLease: () => Promise<void>) {
    const run = await requireRun(this.runtime, runId)
    if (!['queued', 'running'].includes(run.status)) return
    const uncertainSubmission = run.status === 'running'
      && !run.providerTaskId
      && !(Array.isArray(run.result) && run.result.length)
      && run.trace?.networkRequests?.some((request) => request.method === 'POST')
    if (uncertainSubmission) {
      throw new ProviderBoundaryError(
        'provider_submission_uncertain',
        '供应商请求已发送但任务 ID 尚未保存，为避免重复扣费已停止自动重试，请手动确认供应商任务状态',
        false,
      )
    }
    await assertLease()
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
    let result: ProviderExecutionResult | undefined = stagedProviderResult(run)
    if (!result) {
      const token = this.runtime.config.maasApiKey
        ?? await this.runtime.infrastructure.credentials.getModelToken(run.userId!)
      if (!token) throw new ProviderBoundaryError('credential_missing', 'model API token is not configured', false)
      const provider = this.runtime.providers.resolve(
        run.inputSnapshot!.model.providerId,
        run.kind === 'image' || run.kind === 'video' ? run.kind : 'text',
      )
      result = await provider.execute(run.inputSnapshot!, {
        runId,
        workflowId: run.workflowId,
        nodeId: run.nodeId,
        userId: run.userId!,
        token,
        providerTaskId: run.providerTaskId,
        beforeSubmit: assertLease,
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
      await assertLease()
      const current = await requireRun(this.runtime, runId)
      await this.runtime.infrastructure.workflowRuns.save({
        ...current,
        result: result.results,
        resultIds: result.results.map((item) => item.id),
        providerTaskId: result.providerTaskId ?? current.providerTaskId,
        providerResponseId: result.providerResponseId ?? current.providerResponseId,
        updatedAt: Date.now(),
        heartbeatAt: Date.now(),
      })
    }
    if (!result) throw new Error(`provider result was not produced: ${runId}`)
    await assertLease()
    await persistGeneratedResultResources({
      resources: {
        save: (resource, blobId) => (
          this.runtime.infrastructure.postgresResources.save(resource, blobId, run.userId)
        ),
        bind: (input) => this.runtime.infrastructure.postgresResources.bind(input),
      },
      workflowId: run.workflowId,
      nodeId: run.nodeId,
      runId,
      results: result.results,
    })
    await assertLease()
    await appendResultsToWorkflow(
      this.runtime,
      run.workflowId,
      run.nodeId,
      runId,
      result.results,
    )
    await assertLease()
    await completeNodeRun(
      this.runtime,
      runId,
      result.results,
      result.providerTaskId,
      result.providerResponseId,
    )
  }
}

function abortableWait(ms: number, signal: AbortSignal) {
  if (signal.aborted) return Promise.resolve()
  return new Promise<void>((resolve) => {
    const finish = () => {
      clearTimeout(timer)
      signal.removeEventListener('abort', finish)
      resolve()
    }
    const timer = setTimeout(finish, ms)
    signal.addEventListener('abort', finish, { once: true })
  })
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
    const node = workflow.graph.nodes.find((item) => item.id === nodeId)
    try {
      if (node?.data.results?.some((item) => item.id === result.id)) {
        await runtime.infrastructure.postgresWorkflows.patch({
          id: workflowId,
          baseRevision: workflow.revision,
          ops: [
            { type: 'setNodeLatestRun', nodeId, runId },
            { type: 'setNodeStatus', nodeId, status: 'done' },
          ],
        })
        return
      }
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

function stagedProviderResult(
  run: Awaited<ReturnType<typeof requireRun>>,
): ProviderExecutionResult | undefined {
  if (!Array.isArray(run.result) || !run.result.length) return undefined
  return {
    results: run.result as NodeResult[],
    providerTaskId: run.providerTaskId,
    providerResponseId: run.providerResponseId,
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
