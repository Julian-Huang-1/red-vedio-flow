import type {
  NodeRunInput,
  NodeRunTrace,
} from '@red-video-flow/workflow-core'
import type { PostgresDatabase } from './database.js'

export type PostgresWorkflowRun = {
  id: string
  userId?: string
  workflowId: string
  nodeId: string
  status: string
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

export class PostgresRunRepository {
  constructor(private readonly sql: PostgresDatabase) {}

  async get(id: string) {
    const rows = await this.sql`SELECT * FROM runs WHERE id = ${id} LIMIT 1`
    return rows[0] ? toRun(rows[0]) : undefined
  }

  async listByWorkflow(workflowId: string) {
    const rows = await this.sql`
      SELECT * FROM runs WHERE workflow_id = ${workflowId} ORDER BY updated_at DESC
    `
    return rows.map(toRun)
  }

  async listByStatuses(statuses: string[]) {
    const rows = await this.sql`
      SELECT * FROM runs WHERE status = ANY(${this.sql.array(statuses)})
      ORDER BY updated_at DESC
    `
    return rows.map(toRun)
  }

  async save(run: PostgresWorkflowRun) {
    await this.sql`
      INSERT INTO runs (
        id, user_id, workflow_id, node_id, status, prompt, kind, input,
        provider_id, provider_task_id, provider_response_id, result_ids,
        result, trace, error, error_code, error_retryable, created_at,
        updated_at, started_at, heartbeat_at, finished_at
      ) VALUES (
        ${run.id}, ${run.userId ?? null}, ${run.workflowId}, ${run.nodeId},
        ${run.status}, ${run.prompt}, ${run.kind ?? 'text'},
        ${run.inputSnapshot ? this.sql.json(run.inputSnapshot as never) : null},
        ${run.providerId ?? null}, ${run.providerTaskId ?? null},
        ${run.providerResponseId ?? null}, ${this.sql.json((run.resultIds ?? []) as never)},
        ${run.result === undefined ? null : this.sql.json(run.result as never)},
        ${run.trace === undefined ? null : this.sql.json(run.trace as never)},
        ${run.error ?? null}, ${run.errorCode ?? null}, ${run.errorRetryable ?? null},
        ${run.createdAt ?? run.startedAt}, ${run.updatedAt ?? run.heartbeatAt},
        ${run.startedAt}, ${run.heartbeatAt}, ${run.finishedAt ?? null}
      )
      ON CONFLICT (id) DO UPDATE SET
        status = EXCLUDED.status,
        input = EXCLUDED.input,
        provider_id = EXCLUDED.provider_id,
        provider_task_id = EXCLUDED.provider_task_id,
        provider_response_id = EXCLUDED.provider_response_id,
        result_ids = EXCLUDED.result_ids,
        result = EXCLUDED.result,
        trace = EXCLUDED.trace,
        error = EXCLUDED.error,
        error_code = EXCLUDED.error_code,
        error_retryable = EXCLUDED.error_retryable,
        updated_at = EXCLUDED.updated_at,
        heartbeat_at = EXCLUDED.heartbeat_at,
        finished_at = EXCLUDED.finished_at
    `
    return run
  }

  async appendEvent(runId: string, type: string, data: unknown) {
    const createdAt = Date.now()
    const rows = await this.sql`
      INSERT INTO node_run_events (run_id, type, data, created_at)
      VALUES (${runId}, ${type}, ${this.sql.json(data as never)}, ${createdAt})
      RETURNING id
    `
    await this.sql.notify(`node_run_${channelId(runId)}`, String(rows[0].id))
    return { id: Number(rows[0].id), runId, type, data, createdAt }
  }

  async listEvents(runId: string, after = 0) {
    const rows = await this.sql`
      SELECT * FROM node_run_events
      WHERE run_id = ${runId} AND id > ${after}
      ORDER BY id
    `
    return rows.map((row) => ({
      id: Number(row.id),
      runId: String(row.run_id),
      type: String(row.type),
      data: row.data,
      createdAt: Number(row.created_at),
    }))
  }
}

function channelId(value: string) {
  return value.replace(/[^a-zA-Z0-9_]/g, '_').slice(0, 48)
}

function toRun(row: Record<string, unknown>): PostgresWorkflowRun {
  return {
    id: String(row.id),
    userId: row.user_id ? String(row.user_id) : undefined,
    workflowId: String(row.workflow_id),
    nodeId: String(row.node_id),
    status: String(row.status),
    prompt: String(row.prompt),
    kind: String(row.kind) as PostgresWorkflowRun['kind'],
    inputSnapshot: row.input as NodeRunInput | undefined,
    providerId: row.provider_id ? String(row.provider_id) : undefined,
    providerTaskId: row.provider_task_id ? String(row.provider_task_id) : undefined,
    providerResponseId: row.provider_response_id ? String(row.provider_response_id) : undefined,
    resultIds: row.result_ids as string[],
    result: row.result,
    trace: row.trace as NodeRunTrace | undefined,
    error: row.error ? String(row.error) : undefined,
    errorCode: row.error_code ? String(row.error_code) : undefined,
    errorRetryable: row.error_retryable as boolean | undefined,
    createdAt: Number(row.created_at),
    updatedAt: Number(row.updated_at),
    startedAt: Number(row.started_at),
    heartbeatAt: Number(row.heartbeat_at),
    finishedAt: row.finished_at ? Number(row.finished_at) : undefined,
  }
}
