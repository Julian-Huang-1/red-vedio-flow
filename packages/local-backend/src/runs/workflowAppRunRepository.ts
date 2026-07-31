import { desc, eq, inArray } from 'drizzle-orm'
import type { LocalDatabase } from '../db/client.js'
import { workflowAppRuns } from '../db/schema.js'

export type PersistedWorkflowAppRun = {
  id: string
  workflowId: string
  revision: number
  status: string
  createdAt: number
  updatedAt: number
}

export class WorkflowAppRunRepository {
  private onSave?: (run: PersistedWorkflowAppRun) => Promise<void>

  constructor(private readonly database: LocalDatabase) {}

  setPersistenceMirror(save: (run: PersistedWorkflowAppRun) => Promise<void>) {
    this.onSave = save
  }

  get<T extends PersistedWorkflowAppRun>(id: string): T | undefined {
    const row = this.database.db
      .select()
      .from(workflowAppRuns)
      .where(eq(workflowAppRuns.id, id))
      .get()
    return row ? JSON.parse(row.dataJson) as T : undefined
  }

  listByWorkflow<T extends PersistedWorkflowAppRun>(workflowId: string): T[] {
    return this.database.db
      .select()
      .from(workflowAppRuns)
      .where(eq(workflowAppRuns.workflowId, workflowId))
      .orderBy(desc(workflowAppRuns.updatedAt))
      .all()
      .map((row) => JSON.parse(row.dataJson) as T)
  }

  listByStatuses<T extends PersistedWorkflowAppRun>(statuses: string[]): T[] {
    return this.database.db
      .select()
      .from(workflowAppRuns)
      .where(inArray(workflowAppRuns.status, statuses))
      .orderBy(desc(workflowAppRuns.updatedAt))
      .all()
      .map((row) => JSON.parse(row.dataJson) as T)
  }

  save<T extends PersistedWorkflowAppRun>(run: T): T {
    this.database.db
      .insert(workflowAppRuns)
      .values({
        id: run.id,
        workflowId: run.workflowId,
        revision: run.revision,
        status: run.status,
        dataJson: JSON.stringify(run),
        createdAt: run.createdAt,
        updatedAt: run.updatedAt,
      })
      .onConflictDoUpdate({
        target: workflowAppRuns.id,
        set: {
          status: run.status,
          dataJson: JSON.stringify(run),
          updatedAt: run.updatedAt,
        },
      })
      .run()
    void this.onSave?.(run)
    return run
  }
}
