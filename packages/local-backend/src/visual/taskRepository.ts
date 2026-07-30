import { and, asc, eq, inArray, isNull, lte, or } from 'drizzle-orm'
import type { LocalDatabase } from '../db/client.js'
import { visualTasks } from '../db/schema.js'
import type { NodeRunInput } from '@red-video-flow/workflow-core'
import type { VisualRunResult } from './service.js'

type VisualTaskRow = typeof visualTasks.$inferSelect

export type VisualTaskRecordStatus =
  | 'submitting'
  | 'polling'
  | 'succeeded'
  | 'failed'
  | 'timed_out'
  | 'cancelled'

export type VisualTaskRecord = {
  id: string
  runId?: string
  workflowId: string
  nodeId: string
  provider: string
  nodeKind: 'image' | 'video'
  inputSnapshot?: NodeRunInput
  modelId?: string
  submitId?: string
  status: VisualTaskRecordStatus
  attemptCount: number
  nextPollAt: number
  timeoutAt: number
  leaseOwner?: string
  leaseExpiresAt?: number
  lastError?: string
  result?: VisualRunResult
  createdAt: number
  updatedAt: number
  completedAt?: number
  projectedAt?: number
}

const activeStatuses: VisualTaskRecordStatus[] = ['submitting', 'polling']
const terminalStatuses: VisualTaskRecordStatus[] = ['succeeded', 'failed', 'timed_out', 'cancelled']

export class VisualTaskRepository {
  constructor(private readonly database: LocalDatabase) {}

  get(id: string) {
    const row = this.database.db.select().from(visualTasks).where(eq(visualTasks.id, id)).get()
    return row ? toVisualTask(row) : undefined
  }

  findBySubmitId(provider: string, submitId: string) {
    const row = this.database.db
      .select()
      .from(visualTasks)
      .where(and(eq(visualTasks.provider, provider), eq(visualTasks.submitId, submitId)))
      .get()
    return row ? toVisualTask(row) : undefined
  }

  findByRunId(runId: string) {
    const row = this.database.db
      .select()
      .from(visualTasks)
      .where(eq(visualTasks.runId, runId))
      .get()
    return row ? toVisualTask(row) : undefined
  }

  findActiveForNode(workflowId: string, nodeId: string) {
    const row = this.database.db
      .select()
      .from(visualTasks)
      .where(and(
        eq(visualTasks.workflowId, workflowId),
        eq(visualTasks.nodeId, nodeId),
        inArray(visualTasks.status, activeStatuses),
      ))
      .get()
    return row ? toVisualTask(row) : undefined
  }

  listActive() {
    return this.database.db
      .select()
      .from(visualTasks)
      .where(inArray(visualTasks.status, activeStatuses))
      .all()
      .map(toVisualTask)
  }

  listDue(now: number, limit: number) {
    return this.database.db
      .select()
      .from(visualTasks)
      .where(and(
        eq(visualTasks.status, 'polling'),
        lte(visualTasks.nextPollAt, now),
        or(isNull(visualTasks.leaseExpiresAt), lte(visualTasks.leaseExpiresAt, now)),
      ))
      .orderBy(asc(visualTasks.nextPollAt))
      .limit(limit)
      .all()
      .map(toVisualTask)
  }

  listUnprojectedTerminal() {
    return this.database.db
      .select()
      .from(visualTasks)
      .where(and(
        inArray(visualTasks.status, terminalStatuses),
        isNull(visualTasks.projectedAt),
      ))
      .all()
      .map(toVisualTask)
  }

  claim(id: string, owner: string, now: number, leaseExpiresAt: number) {
    const result = this.database.db
      .update(visualTasks)
      .set({ leaseOwner: owner, leaseExpiresAt, updatedAt: now })
      .where(and(
        eq(visualTasks.id, id),
        eq(visualTasks.status, 'polling'),
        or(isNull(visualTasks.leaseExpiresAt), lte(visualTasks.leaseExpiresAt, now)),
      ))
      .run()
    return result.changes > 0
  }

  save(task: VisualTaskRecord) {
    this.database.db
      .insert(visualTasks)
      .values(toRowValues(task))
      .onConflictDoUpdate({
        target: visualTasks.id,
        set: toRowValues(task),
      })
      .run()
    return task
  }

  saveClaimed(task: VisualTaskRecord, owner: string) {
    const result = this.database.db
      .update(visualTasks)
      .set(toRowValues(task))
      .where(and(
        eq(visualTasks.id, task.id),
        eq(visualTasks.status, 'polling'),
        eq(visualTasks.leaseOwner, owner),
      ))
      .run()
    return result.changes > 0 ? task : undefined
  }
}

function toVisualTask(row: VisualTaskRow): VisualTaskRecord {
  return {
    id: row.id,
    runId: row.runId ?? undefined,
    workflowId: row.workflowId,
    nodeId: row.nodeId,
    provider: row.provider,
    nodeKind: row.nodeKind as 'image' | 'video',
    inputSnapshot: row.inputJson ? JSON.parse(row.inputJson) : undefined,
    modelId: row.modelId ?? undefined,
    submitId: row.submitId ?? undefined,
    status: row.status as VisualTaskRecordStatus,
    attemptCount: row.attemptCount,
    nextPollAt: row.nextPollAt,
    timeoutAt: row.timeoutAt,
    leaseOwner: row.leaseOwner ?? undefined,
    leaseExpiresAt: row.leaseExpiresAt ?? undefined,
    lastError: row.lastError ?? undefined,
    result: row.resultJson ? JSON.parse(row.resultJson) : undefined,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    completedAt: row.completedAt ?? undefined,
    projectedAt: row.projectedAt ?? undefined,
  }
}

function toRowValues(task: VisualTaskRecord): typeof visualTasks.$inferInsert {
  return {
    id: task.id,
    runId: task.runId ?? null,
    workflowId: task.workflowId,
    nodeId: task.nodeId,
    provider: task.provider,
    nodeKind: task.nodeKind,
    inputJson: task.inputSnapshot === undefined ? null : JSON.stringify(task.inputSnapshot),
    modelId: task.modelId ?? null,
    submitId: task.submitId ?? null,
    status: task.status,
    attemptCount: task.attemptCount,
    nextPollAt: task.nextPollAt,
    timeoutAt: task.timeoutAt,
    leaseOwner: task.leaseOwner ?? null,
    leaseExpiresAt: task.leaseExpiresAt ?? null,
    lastError: task.lastError ?? null,
    resultJson: task.result === undefined ? null : JSON.stringify(task.result),
    createdAt: task.createdAt,
    updatedAt: task.updatedAt,
    completedAt: task.completedAt ?? null,
    projectedAt: task.projectedAt ?? null,
  }
}
