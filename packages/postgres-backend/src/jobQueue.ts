import { randomUUID } from 'node:crypto'
import type { JobQueue, QueueJob, QueueJobType } from '@red-video-flow/workflow-core'
import type { PostgresDatabase } from './database.js'

export class PostgresJobQueue implements JobQueue {
  constructor(private readonly sql: PostgresDatabase) {}

  async enqueue(input: Pick<QueueJob, 'type' | 'payload'> & Partial<Pick<QueueJob, 'id' | 'priority' | 'maxAttempts' | 'runAt'>>) {
    const now = Date.now()
    const id = input.id ?? randomUUID()
    const rows = await this.sql`
      INSERT INTO jobs (
        id, type, payload, status, priority, attempts, max_attempts,
        run_at, created_at, updated_at
      ) VALUES (
        ${id}, ${input.type}, ${this.sql.json(input.payload as never)}, 'queued',
        ${input.priority ?? 0}, 0, ${input.maxAttempts ?? 3},
        ${input.runAt ?? now}, ${now}, ${now}
      )
      ON CONFLICT (id) DO UPDATE SET id = EXCLUDED.id
      RETURNING *
    `
    await this.sql.notify('red_video_flow_jobs', id)
    return toJob(rows[0])
  }

  async claim(workerId: string, leaseMs: number) {
    const now = Date.now()
    const rows = await this.sql`
      WITH candidate AS (
        SELECT id FROM jobs
        WHERE status = 'queued' AND run_at <= ${now}
        ORDER BY priority DESC, run_at, created_at
        FOR UPDATE SKIP LOCKED
        LIMIT 1
      )
      UPDATE jobs SET
        status = 'running',
        attempts = attempts + 1,
        locked_by = ${workerId},
        locked_at = ${now},
        lease_expires_at = ${now + leaseMs},
        updated_at = ${now}
      WHERE id = (SELECT id FROM candidate)
      RETURNING *
    `
    return rows[0] ? toJob(rows[0]) : undefined
  }

  async heartbeat(jobId: string, workerId: string, leaseMs: number) {
    const now = Date.now()
    const rows = await this.sql`
      UPDATE jobs SET lease_expires_at = ${now + leaseMs}, updated_at = ${now}
      WHERE id = ${jobId} AND locked_by = ${workerId} AND status = 'running'
      RETURNING id
    `
    return rows.length > 0
  }

  async complete(jobId: string, workerId: string) {
    await this.sql`
      UPDATE jobs SET
        status = 'succeeded', locked_by = NULL, locked_at = NULL,
        lease_expires_at = NULL, last_error = NULL, updated_at = ${Date.now()}
      WHERE id = ${jobId} AND locked_by = ${workerId} AND status = 'running'
    `
  }

  async fail(jobId: string, workerId: string, error: string, retryAt?: number) {
    const now = Date.now()
    const rows = await this.sql`
      UPDATE jobs SET
        status = CASE
          WHEN ${retryAt ?? null}::bigint IS NOT NULL AND attempts < max_attempts
          THEN 'queued' ELSE 'failed'
        END,
        run_at = CASE
          WHEN ${retryAt ?? null}::bigint IS NOT NULL AND attempts < max_attempts
          THEN ${retryAt ?? now} ELSE run_at
        END,
        locked_by = NULL,
        locked_at = NULL,
        lease_expires_at = NULL,
        last_error = ${error.slice(0, 4_000)},
        updated_at = ${now}
      WHERE id = ${jobId} AND locked_by = ${workerId} AND status = 'running'
      RETURNING status
    `
    if (rows[0]?.status === 'queued') await this.sql.notify('red_video_flow_jobs', jobId)
  }

  async recoverExpired(now = Date.now()) {
    return (await this.recoverExpiredJobs(now)).length
  }

  async recoverExpiredJobs(now = Date.now()) {
    const rows = await this.sql`
      UPDATE jobs SET
        status = CASE WHEN attempts < max_attempts THEN 'queued' ELSE 'failed' END,
        locked_by = NULL, locked_at = NULL,
        lease_expires_at = NULL,
        last_error = CASE
          WHEN attempts < max_attempts THEN last_error
          ELSE 'worker_lease_exhausted'
        END,
        updated_at = ${now}
      WHERE status = 'running' AND lease_expires_at <= ${now}
      RETURNING id, type, payload, status
    `
    if (rows.some((row) => row.status === 'queued')) {
      await this.sql.notify('red_video_flow_jobs', 'recovered')
    }
    const pendingFinalizations = await this.sql`
      SELECT id, type, payload, status FROM jobs j
      WHERE j.status = 'failed' AND j.last_error = 'worker_lease_exhausted'
    `
    const finalizationIds = new Set(pendingFinalizations.map((row) => String(row.id)))
    const actionableRows = [
      ...rows.filter((row) => row.status === 'queued' || !finalizationIds.has(String(row.id))),
      ...pendingFinalizations,
    ]
    return actionableRows.map((row) => ({
      id: String(row.id),
      type: String(row.type) as QueueJobType,
      payload: row.payload as Record<string, unknown>,
      status: String(row.status) as 'queued' | 'failed',
    }))
  }

  async completeExpiredFinalization(jobId: string) {
    await this.sql`
      UPDATE jobs SET last_error = NULL, updated_at = ${Date.now()}
      WHERE id = ${jobId} AND status = 'failed'
        AND last_error = 'worker_lease_exhausted'
    `
  }

  async waitForWork(signal: AbortSignal) {
    if (signal.aborted) return
    let resolveWait = () => {}
    const wait = new Promise<void>((resolve) => {
      resolveWait = resolve
    })
    const listener = await this.sql.listen('red_video_flow_jobs', resolveWait)
    const timeout = setTimeout(resolveWait, 5_000)
    const abort = () => resolveWait()
    signal.addEventListener('abort', abort, { once: true })
    try {
      await wait
    } finally {
      clearTimeout(timeout)
      signal.removeEventListener('abort', abort)
      await listener.unlisten()
    }
  }
}

function toJob(row: Record<string, unknown>): QueueJob {
  return {
    id: String(row.id),
    type: String(row.type) as QueueJobType,
    payload: row.payload as Record<string, unknown>,
    status: String(row.status) as QueueJob['status'],
    priority: Number(row.priority),
    attempts: Number(row.attempts),
    maxAttempts: Number(row.max_attempts),
    runAt: Number(row.run_at),
    lockedBy: row.locked_by ? String(row.locked_by) : undefined,
    lockedAt: row.locked_at ? Number(row.locked_at) : undefined,
    leaseExpiresAt: row.lease_expires_at ? Number(row.lease_expires_at) : undefined,
    lastError: row.last_error ? String(row.last_error) : undefined,
    createdAt: Number(row.created_at),
    updatedAt: Number(row.updated_at),
  }
}
