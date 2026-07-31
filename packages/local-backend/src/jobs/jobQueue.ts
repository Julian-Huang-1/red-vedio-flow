import { randomUUID } from 'node:crypto'
import { and, asc, desc, eq, lte } from 'drizzle-orm'
import type { JobQueue, QueueJob, QueueJobType } from '@red-video-flow/workflow-core'
import type { LocalDatabase } from '../db/client.js'
import { jobs } from '../db/schema.js'

export class LocalJobQueue implements JobQueue {
  constructor(private readonly database: LocalDatabase) {}

  async enqueue(input: Pick<QueueJob, 'type' | 'payload'> & Partial<Pick<QueueJob, 'id' | 'priority' | 'maxAttempts' | 'runAt'>>) {
    const now = Date.now()
    const job: QueueJob = {
      id: input.id ?? randomUUID(),
      type: input.type,
      payload: input.payload,
      status: 'queued',
      priority: input.priority ?? 0,
      attempts: 0,
      maxAttempts: input.maxAttempts ?? 3,
      runAt: input.runAt ?? now,
      createdAt: now,
      updatedAt: now,
    }
    this.database.db.insert(jobs).values(toRow(job)).onConflictDoNothing().run()
    return (await this.get(job.id)) ?? job
  }

  async claim(workerId: string, leaseMs: number) {
    const now = Date.now()
    return this.database.sqlite.transaction(() => {
      const row = this.database.db.select().from(jobs)
        .where(and(eq(jobs.status, 'queued'), lte(jobs.runAt, now)))
        .orderBy(desc(jobs.priority), asc(jobs.runAt), asc(jobs.createdAt))
        .get()
      if (!row) return undefined
      const updated = this.database.db.update(jobs).set({
        status: 'running',
        attempts: row.attempts + 1,
        lockedBy: workerId,
        lockedAt: now,
        leaseExpiresAt: now + leaseMs,
        updatedAt: now,
      }).where(and(eq(jobs.id, row.id), eq(jobs.status, 'queued'))).run()
      return updated.changes ? fromRow({ ...row, status: 'running', attempts: row.attempts + 1, lockedBy: workerId, lockedAt: now, leaseExpiresAt: now + leaseMs, updatedAt: now }) : undefined
    })()
  }

  async heartbeat(jobId: string, workerId: string, leaseMs: number) {
    const now = Date.now()
    const result = this.database.db.update(jobs).set({
      leaseExpiresAt: now + leaseMs,
      updatedAt: now,
    }).where(and(eq(jobs.id, jobId), eq(jobs.lockedBy, workerId), eq(jobs.status, 'running'))).run()
    return result.changes > 0
  }

  async complete(jobId: string, workerId: string) {
    this.finish(jobId, workerId, { status: 'succeeded', lastError: null })
  }

  async fail(jobId: string, workerId: string, error: string, retryAt?: number) {
    const row = this.database.db.select().from(jobs).where(eq(jobs.id, jobId)).get()
    if (!row || row.lockedBy !== workerId || row.status !== 'running') return
    const retry = retryAt !== undefined && row.attempts < row.maxAttempts
    this.finish(jobId, workerId, {
      status: retry ? 'queued' : 'failed',
      runAt: retry ? retryAt : row.runAt,
      lastError: error.slice(0, 4_000),
    })
  }

  async recoverExpired(now = Date.now()) {
    const result = this.database.db.update(jobs).set({
      status: 'queued',
      lockedBy: null,
      lockedAt: null,
      leaseExpiresAt: null,
      updatedAt: now,
    }).where(and(eq(jobs.status, 'running'), lte(jobs.leaseExpiresAt, now))).run()
    return result.changes
  }

  async waitForWork(signal: AbortSignal) {
    if (signal.aborted) return
    await new Promise<void>((resolve) => {
      const timer = setTimeout(resolve, 250)
      signal.addEventListener('abort', () => {
        clearTimeout(timer)
        resolve()
      }, { once: true })
    })
  }

  private async get(id: string) {
    const row = this.database.db.select().from(jobs).where(eq(jobs.id, id)).get()
    return row ? fromRow(row) : undefined
  }

  private finish(jobId: string, workerId: string, patch: { status: 'queued' | 'succeeded' | 'failed'; runAt?: number; lastError: string | null }) {
    this.database.db.update(jobs).set({
      ...patch,
      lockedBy: null,
      lockedAt: null,
      leaseExpiresAt: null,
      updatedAt: Date.now(),
    }).where(and(eq(jobs.id, jobId), eq(jobs.lockedBy, workerId), eq(jobs.status, 'running'))).run()
  }
}

function fromRow(row: typeof jobs.$inferSelect): QueueJob {
  return {
    id: row.id,
    type: row.type as QueueJobType,
    payload: JSON.parse(row.payloadJson),
    status: row.status as QueueJob['status'],
    priority: row.priority,
    attempts: row.attempts,
    maxAttempts: row.maxAttempts,
    runAt: row.runAt,
    lockedBy: row.lockedBy ?? undefined,
    lockedAt: row.lockedAt ?? undefined,
    leaseExpiresAt: row.leaseExpiresAt ?? undefined,
    lastError: row.lastError ?? undefined,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
}

function toRow(job: QueueJob): typeof jobs.$inferInsert {
  return {
    id: job.id,
    type: job.type,
    payloadJson: JSON.stringify(job.payload),
    status: job.status,
    priority: job.priority,
    attempts: job.attempts,
    maxAttempts: job.maxAttempts,
    runAt: job.runAt,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
  }
}
