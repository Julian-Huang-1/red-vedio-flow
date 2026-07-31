import type { WorkflowDocument } from '@red-video-flow/workflow-core'
import type { PostgresDatabase } from './database.js'

export class PostgresWorkflowRepository {
  constructor(private readonly sql: PostgresDatabase) {}

  async list() {
    const rows = await this.sql`SELECT * FROM workflows ORDER BY updated_at DESC`
    return rows.map(toWorkflow)
  }

  async get(id: string) {
    const rows = await this.sql`SELECT * FROM workflows WHERE id = ${id} LIMIT 1`
    return rows[0] ? toWorkflow(rows[0]) : undefined
  }

  async save(document: WorkflowDocument, expectedRevision?: number) {
    const rows = expectedRevision === undefined
      ? await this.sql`
          INSERT INTO workflows (
            id, title, schema_version, revision, graph, created_at, updated_at
          ) VALUES (
            ${document.id}, ${document.title}, ${document.schemaVersion}, ${document.revision},
            ${this.sql.json(document.graph as never)}, ${document.createdAt}, ${document.updatedAt}
          )
          ON CONFLICT (id) DO UPDATE SET
            title = EXCLUDED.title,
            schema_version = EXCLUDED.schema_version,
            revision = EXCLUDED.revision,
            graph = EXCLUDED.graph,
            updated_at = EXCLUDED.updated_at
          RETURNING *
        `
      : await this.sql`
          UPDATE workflows SET
            title = ${document.title},
            schema_version = ${document.schemaVersion},
            revision = ${document.revision},
            graph = ${this.sql.json(document.graph as never)},
            updated_at = ${document.updatedAt}
          WHERE id = ${document.id} AND revision = ${expectedRevision}
          RETURNING *
        `
    if (!rows[0]) throw new PostgresWorkflowConflictError(document.id, expectedRevision!)
    return toWorkflow(rows[0])
  }

  async delete(id: string) {
    const rows = await this.sql`DELETE FROM workflows WHERE id = ${id} RETURNING id`
    return rows.length > 0
  }
}

export class PostgresWorkflowConflictError extends Error {
  constructor(readonly workflowId: string, readonly expectedRevision: number) {
    super(`workflow revision conflict: ${workflowId} expected ${expectedRevision}`)
    this.name = 'PostgresWorkflowConflictError'
  }
}

function toWorkflow(row: Record<string, unknown>): WorkflowDocument {
  return {
    schemaVersion: Number(row.schema_version) as 1,
    id: String(row.id),
    title: String(row.title),
    revision: Number(row.revision),
    graph: row.graph as WorkflowDocument['graph'],
    createdAt: Number(row.created_at),
    updatedAt: Number(row.updated_at),
  }
}
