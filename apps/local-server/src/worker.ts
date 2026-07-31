import { randomUUID } from 'node:crypto'
import type { QueueJob } from '@red-video-flow/workflow-core'
import type { LocalServerRuntime } from './runtime.js'
import { startDurableWorkflowNodeRun } from './nodeExecutionService.js'
import { startWorkflowAppRun } from './routes/workflowAppRoutes.js'

const leaseMs = 60_000

export class WorkflowWorker {
  private readonly workerId = `worker-${process.pid}-${randomUUID()}`
  private readonly controller = new AbortController()
  private loopPromise?: Promise<void>

  constructor(private readonly runtime: LocalServerRuntime) {}

  start() {
    this.loopPromise ??= this.loop()
  }

  async stop() {
    this.controller.abort()
    await this.loopPromise
  }

  private async loop() {
    await this.runtime.backend.jobs.recoverExpired()
    while (!this.controller.signal.aborted) {
      const job = await this.runtime.backend.jobs.claim(this.workerId, leaseMs)
      if (!job) {
        await this.runtime.backend.jobs.waitForWork(this.controller.signal)
        continue
      }
      await this.execute(job)
    }
  }

  private async execute(job: QueueJob) {
    const heartbeat = setInterval(() => {
      void this.runtime.backend.jobs.heartbeat(job.id, this.workerId, leaseMs)
    }, leaseMs / 3)
    heartbeat.unref()
    try {
      const runId = typeof job.payload.runId === 'string' ? job.payload.runId : undefined
      if (!runId) throw new Error(`${job.type} job is missing runId`)
      if (job.type === 'execute-node') {
        await startDurableWorkflowNodeRun(this.runtime, runId, this.controller.signal)
        const completedRun = this.runtime.backend.runs.getNodeRun(runId)
        if (completedRun?.status === 'failed' || completedRun?.status === 'timed_out') {
          throw new Error(completedRun.error?.message ?? 'node execution failed')
        }
      } else if (job.type === 'schedule-workflow') {
        await startWorkflowAppRun(this.runtime, runId)
      } else {
        throw new Error(`unsupported job type: ${job.type}`)
      }
      await this.runtime.backend.jobs.complete(job.id, this.workerId)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      await this.runtime.backend.jobs.fail(
        job.id,
        this.workerId,
        message,
        Date.now() + Math.min(30_000, 1_000 * 2 ** job.attempts),
      )
      const runId = typeof job.payload.runId === 'string' ? job.payload.runId : undefined
      if (runId && job.type === 'execute-node') {
        this.runtime.backend.runs.failNodeRun(runId, {
          code: 'worker_execution_failed',
          message,
          retryable: job.attempts < job.maxAttempts,
        })
      }
    } finally {
      clearInterval(heartbeat)
    }
  }
}
