import { and, asc, eq, gt, inArray } from 'drizzle-orm'
import type { NodeRunInput, NodeRunStatus, NodeRunTrace } from '@red-video-flow/workflow-core'
import type { LocalDatabase } from '../db/client.js'
import { nodeRunEvents, runs } from '../db/schema.js'

type RunRow = typeof runs.$inferSelect

export type WorkflowRunStatus =
  | 'queued'
  | 'running'
  | 'done'
  | 'error'
  | 'timeout'
  | 'succeeded'
  | 'failed'
  | 'cancelled'
  | 'timed_out'
  | 'interrupted'

export type WorkflowRun = {
  id: string
  workflowId: string
  nodeId: string
  status: WorkflowRunStatus
  prompt: string
  kind?: 'text' | 'image' | 'video'
  inputSnapshot?: NodeRunInput
  providerId?: string
  providerTaskId?: string
  providerResponseId?: string
  resultIds?: string[]
  result?: unknown
  trace?: NodeRunTrace
  error?: string
  errorCode?: string
  errorRetryable?: boolean
  createdAt?: number
  updatedAt?: number
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

  listByWorkflow(workflowId: string) {
    return this.database.db.select().from(runs)
      .where(eq(runs.workflowId, workflowId))
      .all()
      .map(toRun)
  }

  listByStatuses(statuses: WorkflowRunStatus[]) {
    return this.database.db.select().from(runs)
      .where(inArray(runs.status, statuses))
      .all()
      .map(toRun)
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

  appendEvent(runId: string, type: string, data: unknown) {
    const result = this.database.db.insert(nodeRunEvents).values({
      runId,
      type,
      dataJson: JSON.stringify(data),
      createdAt: Date.now(),
    }).run()
    return {
      id: Number(result.lastInsertRowid),
      runId,
      type,
      data,
      createdAt: Date.now(),
    }
  }

  listEvents(runId: string, after = 0) {
    return this.database.db.select().from(nodeRunEvents)
      .where(and(eq(nodeRunEvents.runId, runId), gt(nodeRunEvents.id, after)))
      .orderBy(asc(nodeRunEvents.id))
      .all()
      .map((row) => ({
        id: row.id,
        runId: row.runId,
        type: row.type,
        data: JSON.parse(row.dataJson),
        createdAt: row.createdAt,
      }))
  }
}

function toRun(row: RunRow): WorkflowRun {
  return {
    id: row.id,
    workflowId: row.workflowId,
    nodeId: row.nodeId,
    status: row.status as WorkflowRunStatus,
    prompt: row.prompt,
    kind: row.kind as WorkflowRun['kind'],
    inputSnapshot: row.inputJson ? JSON.parse(row.inputJson) : undefined,
    providerId: row.providerId ?? undefined,
    providerTaskId: row.providerTaskId ?? undefined,
    providerResponseId: row.providerResponseId ?? undefined,
    resultIds: row.resultIdsJson ? JSON.parse(row.resultIdsJson) : [],
    result: row.resultJson ? JSON.parse(row.resultJson) : undefined,
    trace: row.traceJson ? JSON.parse(row.traceJson) : undefined,
    error: row.error ?? undefined,
    errorCode: row.errorCode ?? undefined,
    errorRetryable: row.errorRetryable === null ? undefined : Boolean(row.errorRetryable),
    createdAt: row.createdAt || row.startedAt,
    updatedAt: row.updatedAt || row.heartbeatAt || row.startedAt,
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
    kind: run.kind ?? 'text',
    inputJson: run.inputSnapshot === undefined ? null : JSON.stringify(run.inputSnapshot),
    providerId: run.providerId ?? null,
    providerTaskId: run.providerTaskId ?? null,
    providerResponseId: run.providerResponseId ?? null,
    resultIdsJson: JSON.stringify(run.resultIds ?? []),
    resultJson: run.result === undefined ? null : JSON.stringify(run.result),
    traceJson: run.trace === undefined ? null : JSON.stringify(run.trace),
    error: run.error ?? null,
    errorCode: run.errorCode ?? null,
    errorRetryable: run.errorRetryable === undefined ? null : Number(run.errorRetryable),
    createdAt: run.createdAt ?? run.startedAt,
    updatedAt: run.updatedAt ?? run.heartbeatAt,
    startedAt: run.startedAt,
    heartbeatAt: run.heartbeatAt,
    finishedAt: run.finishedAt ?? null,
  }
}
