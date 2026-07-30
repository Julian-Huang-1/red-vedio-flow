import { randomUUID } from 'node:crypto'
import { and, desc, eq, isNull, like, or } from 'drizzle-orm'
import type {
  Resource,
  ResourceBinding,
  ResourceKind,
  ResourceRelation,
  ResourceSource,
} from '@red-video-flow/workflow-core'
import { resourceBindings, resources } from '../db/schema.js'
import type { LocalDatabase } from '../db/client.js'

type FileResourceInput = {
  id: string
  workspaceId: string
  kind: ResourceKind
  name: string
  mimeType?: string
  url: string
  localPath: string
  source?: ResourceSource
  sourceNodeId?: string
  sourceRunId?: string
  sourceResultId?: string
  providerId?: string
  modelId?: string
  prompt?: string
  generationConfig?: Record<string, unknown>
}

export class ResourceService {
  constructor(private readonly database: LocalDatabase) {
    this.database.sqlite.exec(`
      INSERT OR IGNORE INTO resources (
        id, workspace_id, kind, name, mime_type, url, local_path, file_name,
        source, provider_id, created_at, updated_at
      )
      SELECT
        id, workflow_id, kind, file_name, mime_type, url, local_path, file_name,
        CASE WHEN provider IS NULL THEN 'upload' ELSE 'generated' END,
        provider, created_at, created_at
      FROM assets
      WHERE workflow_id IS NOT NULL
    `)
  }

  list(input: {
    workspaceId: string
    kind?: ResourceKind
    source?: ResourceSource
    query?: string
  }) {
    const conditions = [
      eq(resources.workspaceId, input.workspaceId),
      isNull(resources.deletedAt),
    ]
    if (input.kind) conditions.push(eq(resources.kind, input.kind))
    if (input.source) conditions.push(eq(resources.source, input.source))
    if (input.query?.trim()) {
      const pattern = `%${input.query.trim()}%`
      conditions.push(or(like(resources.name, pattern), like(resources.textContent, pattern))!)
    }
    return this.database.db.select().from(resources)
      .where(and(...conditions))
      .orderBy(desc(resources.updatedAt))
      .all()
      .map(toResource)
  }

  get(id: string) {
    const row = this.database.db.select().from(resources)
      .where(and(eq(resources.id, id), isNull(resources.deletedAt)))
      .get()
    return row ? toResource(row) : undefined
  }

  upsertFile(input: FileResourceInput) {
    const existing = this.database.db.select().from(resources)
      .where(eq(resources.id, input.id))
      .get()
    const now = Date.now()
    const row: typeof resources.$inferInsert = {
      id: input.id,
      workspaceId: input.workspaceId,
      kind: input.kind,
      name: input.name,
      mimeType: input.mimeType,
      url: input.url,
      localPath: input.localPath,
      fileName: input.name,
      source: input.source ?? 'upload',
      sourceNodeId: input.sourceNodeId,
      sourceRunId: input.sourceRunId,
      sourceResultId: input.sourceResultId,
      providerId: input.providerId,
      modelId: input.modelId,
      prompt: input.prompt,
      generationConfigJson: json(input.generationConfig),
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    }
    this.database.db.insert(resources).values(row)
      .onConflictDoUpdate({
        target: resources.id,
        set: {
          workspaceId: row.workspaceId,
          kind: row.kind,
          name: row.name,
          mimeType: row.mimeType,
          url: row.url,
          localPath: row.localPath,
          fileName: row.fileName,
          source: row.source,
          sourceNodeId: row.sourceNodeId,
          sourceRunId: row.sourceRunId,
          sourceResultId: row.sourceResultId,
          providerId: row.providerId,
          modelId: row.modelId,
          prompt: row.prompt,
          generationConfigJson: row.generationConfigJson,
          updatedAt: now,
          deletedAt: null,
        },
      })
      .run()
    return this.get(input.id)!
  }

  createText(input: {
    workspaceId: string
    name: string
    text: string
    source?: ResourceSource
    sourceNodeId?: string
    sourceRunId?: string
    sourceResultId?: string
    providerId?: string
    modelId?: string
    prompt?: string
    generationConfig?: Record<string, unknown>
  }) {
    const now = Date.now()
    const id = randomUUID()
    this.database.db.insert(resources).values({
      id,
      workspaceId: input.workspaceId,
      kind: 'text',
      name: input.name,
      textContent: input.text,
      source: input.source ?? 'generated',
      sourceNodeId: input.sourceNodeId,
      sourceRunId: input.sourceRunId,
      sourceResultId: input.sourceResultId,
      providerId: input.providerId,
      modelId: input.modelId,
      prompt: input.prompt,
      generationConfigJson: json(input.generationConfig),
      createdAt: now,
      updatedAt: now,
    }).run()
    return this.get(id)!
  }

  rename(id: string, name: string) {
    this.database.db.update(resources)
      .set({ name: name.trim(), updatedAt: Date.now() })
      .where(eq(resources.id, id))
      .run()
    return this.get(id)
  }

  softDelete(id: string) {
    this.database.db.update(resources)
      .set({ deletedAt: Date.now(), updatedAt: Date.now() })
      .where(eq(resources.id, id))
      .run()
  }

  bind(input: {
    resourceId: string
    workflowId: string
    nodeId?: string
    runId?: string
    resultId?: string
    relation: ResourceRelation
  }) {
    const existing = this.database.sqlite.prepare(`
      SELECT id FROM resource_bindings
      WHERE resource_id = ? AND workflow_id = ?
        AND IFNULL(node_id, '') = IFNULL(?, '')
        AND IFNULL(run_id, '') = IFNULL(?, '')
        AND IFNULL(result_id, '') = IFNULL(?, '')
        AND relation = ?
      LIMIT 1
    `).get(
      input.resourceId,
      input.workflowId,
      input.nodeId ?? null,
      input.runId ?? null,
      input.resultId ?? null,
      input.relation,
    ) as { id: string } | undefined
    if (existing) return this.bindings(input.resourceId).find((item) => item.id === existing.id)!
    const row: typeof resourceBindings.$inferInsert = {
      id: randomUUID(),
      resourceId: input.resourceId,
      workflowId: input.workflowId,
      nodeId: input.nodeId,
      runId: input.runId,
      resultId: input.resultId,
      relation: input.relation,
      createdAt: Date.now(),
    }
    this.database.db.insert(resourceBindings).values(row).run()
    return toBinding(row as typeof resourceBindings.$inferSelect)
  }

  bindings(resourceId: string) {
    return this.database.db.select().from(resourceBindings)
      .where(eq(resourceBindings.resourceId, resourceId))
      .all()
      .map(toBinding)
  }
}

function toResource(row: typeof resources.$inferSelect): Resource {
  const metadata = parseJson(row.metadataJson)
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    kind: row.kind as ResourceKind,
    name: row.name,
    mimeType: row.mimeType ?? undefined,
    text: row.textContent ?? undefined,
    url: row.url ?? undefined,
    localPath: row.localPath ?? undefined,
    fileName: row.fileName ?? undefined,
    size: numberValue(metadata.size),
    width: numberValue(metadata.width),
    height: numberValue(metadata.height),
    duration: numberValue(metadata.duration),
    thumbnailUrl: stringValue(metadata.thumbnailUrl),
    source: row.source as ResourceSource,
    sourceNodeId: row.sourceNodeId ?? undefined,
    sourceRunId: row.sourceRunId ?? undefined,
    sourceResultId: row.sourceResultId ?? undefined,
    providerId: row.providerId ?? undefined,
    modelId: row.modelId ?? undefined,
    prompt: row.prompt ?? undefined,
    generationConfig: parseJson(row.generationConfigJson),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    deletedAt: row.deletedAt ?? undefined,
  }
}

function toBinding(row: typeof resourceBindings.$inferSelect): ResourceBinding {
  return {
    id: row.id,
    resourceId: row.resourceId,
    workflowId: row.workflowId,
    nodeId: row.nodeId ?? undefined,
    runId: row.runId ?? undefined,
    resultId: row.resultId ?? undefined,
    relation: row.relation as ResourceRelation,
    createdAt: row.createdAt,
  }
}

function json(value: unknown) {
  return value === undefined ? undefined : JSON.stringify(value)
}

function parseJson(value: string | null | undefined): Record<string, unknown> {
  if (!value) return {}
  try {
    const parsed = JSON.parse(value)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}
  } catch {
    return {}
  }
}

function numberValue(value: unknown) {
  return typeof value === 'number' ? value : undefined
}

function stringValue(value: unknown) {
  return typeof value === 'string' ? value : undefined
}
