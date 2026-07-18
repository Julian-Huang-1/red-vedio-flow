import { eq } from 'drizzle-orm'
import type { LocalDatabase } from '../db/client.js'
import { runs } from '../db/schema.js'

type RunRow = typeof runs.$inferSelect

export type WorkflowRunStatus = 'running' | 'done' | 'error' | 'timeout'

export type WorkflowRun = {
  id: string
  workflowId: string
  nodeId: string
  status: WorkflowRunStatus
  prompt: string
  result?: unknown
  error?: string
  startedAt: number
  heartbeatAt: number
  finishedAt?: number
}

export class RunRepository {
  constructor(private readonly database: LocalDatabase) {}

  get(id: string) {
    const row = this.database.db.select().from(runs).where(eq(runs.id, id)).get()
    return row ? toRun(row) : undefined
  }

  listRunning() {
    return this.database.db
      .select()
      .from(runs)
      .where(eq(runs.status, 'running'))
      .all()
      .map((row) => toRun(row))
  }

  save(run: WorkflowRun) {
    this.database.db
      .insert(runs)
      .values(toRowValues(run))
      .onConflictDoUpdate({
        target: runs.id,
        set: toRowValues(run),
      })
      .run()

    return run
  }
}

function toRun(row: RunRow): WorkflowRun {
  return {
    id: row.id,
    workflowId: row.workflowId,
    nodeId: row.nodeId,
    status: row.status as WorkflowRunStatus,
    prompt: row.prompt,
    result: row.resultJson ? JSON.parse(row.resultJson) : undefined,
    error: row.error ?? undefined,
    startedAt: row.startedAt,
    heartbeatAt: row.heartbeatAt || row.startedAt,
    finishedAt: row.finishedAt ?? undefined,
  }
}

function toRowValues(run: WorkflowRun): typeof runs.$inferInsert {
  return {
    id: run.id,
    workflowId: run.workflowId,
    nodeId: run.nodeId,
    status: run.status,
    prompt: run.prompt,
    resultJson: run.result === undefined ? null : JSON.stringify(run.result),
    error: run.error ?? null,
    startedAt: run.startedAt,
    heartbeatAt: run.heartbeatAt,
    finishedAt: run.finishedAt ?? null,
  }
}
