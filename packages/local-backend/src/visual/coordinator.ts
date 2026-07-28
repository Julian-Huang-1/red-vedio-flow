import type { VisualTaskReconcileResult, VisualTaskService } from './taskService.js'

export type VisualTaskCoordinatorOptions = {
  intervalMs?: number
  batchSize?: number
  owner?: string
  onResult?: (result: VisualTaskReconcileResult) => void
  onError?: (error: unknown) => void
}

export class VisualTaskCoordinator {
  private readonly intervalMs: number
  private readonly batchSize: number
  private readonly owner: string
  private timer?: NodeJS.Timeout
  private activeRun?: Promise<void>
  private stopped = true

  constructor(
    private readonly tasks: VisualTaskService,
    private readonly options: VisualTaskCoordinatorOptions = {},
  ) {
    this.intervalMs = options.intervalMs ?? 5_000
    this.batchSize = options.batchSize ?? 4
    this.owner = options.owner ?? `visual-worker-${process.pid}-${Math.round(Math.random() * 10_000)}`
  }

  start() {
    if (!this.stopped) return
    this.stopped = false
    const bootstrap = this.tasks.bootstrap()
    if (bootstrap.imported) {
      console.log(`[red-video-flow] imported ${bootstrap.imported} recoverable visual task(s)`)
    }
    this.schedule(0)
  }

  async stop() {
    this.stopped = true
    if (this.timer) clearTimeout(this.timer)
    this.timer = undefined
    await this.activeRun
  }

  async tick() {
    return this.tasks.reconcileDue({ owner: this.owner, limit: this.batchSize })
  }

  private schedule(delayMs: number) {
    if (this.stopped) return
    this.timer = setTimeout(() => {
      this.activeRun = this.runOnce()
    }, delayMs)
    this.timer.unref()
  }

  private async runOnce() {
    try {
      const result = await this.tick()
      this.options.onResult?.(result)
    } catch (error) {
      this.options.onError?.(error)
    } finally {
      this.activeRun = undefined
      this.schedule(this.intervalMs)
    }
  }
}
