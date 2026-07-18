import { eq } from 'drizzle-orm'
import type { WorkflowDocument } from '@red-video-flow/workflow-core'
import type { LocalDatabase } from '../db/client.js'
import { workflows } from '../db/schema.js'

type WorkflowRow = typeof workflows.$inferSelect

export class WorkflowRepository {
  constructor(private readonly database: LocalDatabase) {}

  list() {
    return this.database.db
      .select()
      .from(workflows)
      .all()
      .map((row) => toDocument(row))
  }

  get(id: string) {
    const row = this.database.db.select().from(workflows).where(eq(workflows.id, id)).get()
    return row ? toDocument(row) : undefined
  }

  save(document: WorkflowDocument) {
    this.database.db
      .insert(workflows)
      .values(toRowValues(document))
      .onConflictDoUpdate({
        target: workflows.id,
        set: toRowValues(document),
      })
      .run()

    return document
  }

  delete(id: string) {
    this.database.db.delete(workflows).where(eq(workflows.id, id)).run()
  }
}

function toDocument(row: WorkflowRow): WorkflowDocument {
  return {
    schemaVersion: row.schemaVersion as 1,
    id: row.id,
    title: row.title,
    revision: row.revision,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    graph: JSON.parse(row.graphJson) as WorkflowDocument['graph'],
  }
}

function toRowValues(document: WorkflowDocument): typeof workflows.$inferInsert {
  return {
    id: document.id,
    title: document.title,
    schemaVersion: document.schemaVersion,
    revision: document.revision,
    graphJson: JSON.stringify(document.graph),
    createdAt: document.createdAt,
    updatedAt: document.updatedAt,
  }
}
