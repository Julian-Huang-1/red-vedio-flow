import type { PostgresDatabase } from './database.js'

export type PostgresWorkflowAppRun = {
  id: string
  workflowId: string
  revision: number
  status: string
  createdAt: number
  updatedAt: number
}

export class PostgresWorkflowAppRunRepository {
  constructor(private readonly sql: PostgresDatabase) {}

  async get<T extends PostgresWorkflowAppRun>(id: string) {
    const rows = await this.sql`
      SELECT data FROM workflow_app_runs WHERE id = ${id} LIMIT 1
    `
    return rows[0]?.data as T | undefined
  }

  async listByWorkflow<T extends PostgresWorkflowAppRun>(workflowId: string) {
    const rows = await this.sql`
      SELECT data FROM workflow_app_runs
      WHERE workflow_id = ${workflowId}
      ORDER BY updated_at DESC
    `
    return rows.map((row) => row.data as T)
  }

  async listByStatuses<T extends PostgresWorkflowAppRun>(statuses: string[]) {
    const rows = await this.sql`
      SELECT data FROM workflow_app_runs
      WHERE status = ANY(${this.sql.array(statuses)})
      ORDER BY updated_at DESC
    `
    return rows.map((row) => row.data as T)
  }

  async save<T extends PostgresWorkflowAppRun>(run: T) {
    await this.sql`
      INSERT INTO workflow_app_runs (
        id, workflow_id, revision, status, data, created_at, updated_at
      ) VALUES (
        ${run.id}, ${run.workflowId}, ${run.revision}, ${run.status},
        ${this.sql.json(run as never)}, ${run.createdAt}, ${run.updatedAt}
      )
      ON CONFLICT (id) DO UPDATE SET
        status = EXCLUDED.status,
        data = EXCLUDED.data,
        updated_at = EXCLUDED.updated_at
    `
    return run
  }
}
