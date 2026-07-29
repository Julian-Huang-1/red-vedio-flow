import { eq, inArray } from 'drizzle-orm'
import type {
  PluginExecutionKind,
  PluginExecutionRecord,
  PluginExecutionStatus,
} from '@red-video-flow/plugin-contract'
import type { LocalDatabase } from '../db/client.js'
import { executions } from '../db/schema.js'

type ExecutionRow = typeof executions.$inferSelect

export type ExecutionKind = PluginExecutionKind
export type ExecutionStatus = PluginExecutionStatus
export type ExecutionRecord = PluginExecutionRecord

export class ExecutionRepository {
  constructor(private readonly database: LocalDatabase) {}

  get(id: string) {
    const row = this.database.db.select().from(executions).where(eq(executions.id, id)).get()
    return row ? toExecution(row) : undefined
  }

  listActive() {
    return this.database.db
      .select()
      .from(executions)
      .where(inArray(executions.status, ['queued', 'running', 'waiting_provider']))
      .all()
      .map(toExecution)
  }

  save(execution: ExecutionRecord) {
    this.database.db
      .insert(executions)
      .values(toRowValues(execution))
      .onConflictDoUpdate({
        target: executions.id,
        set: toRowValues(execution),
      })
      .run()
    return execution
  }
}

function toExecution(row: ExecutionRow): ExecutionRecord {
  return {
    id: row.id,
    pluginId: row.pluginId,
    contributionId: row.contributionId,
    kind: row.kind as ExecutionKind,
    status: row.status as ExecutionStatus,
    input: row.inputJson ? JSON.parse(row.inputJson) : undefined,
    result: row.resultJson ? JSON.parse(row.resultJson) : undefined,
    errorCode: row.errorCode ?? undefined,
    errorMessage: row.errorMessage ?? undefined,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    startedAt: row.startedAt ?? undefined,
    finishedAt: row.finishedAt ?? undefined,
  }
}

function toRowValues(execution: ExecutionRecord): typeof executions.$inferInsert {
  return {
    id: execution.id,
    pluginId: execution.pluginId,
    contributionId: execution.contributionId,
    kind: execution.kind,
    status: execution.status,
    inputJson: execution.input === undefined ? null : JSON.stringify(execution.input),
    resultJson: execution.result === undefined ? null : JSON.stringify(execution.result),
    errorCode: execution.errorCode ?? null,
    errorMessage: execution.errorMessage ?? null,
    createdAt: execution.createdAt,
    updatedAt: execution.updatedAt,
    startedAt: execution.startedAt ?? null,
    finishedAt: execution.finishedAt ?? null,
  }
}
