import { randomUUID } from 'node:crypto'
import type {
  Resource,
  ResourceBinding,
  ResourceKind,
  ResourceRelation,
  ResourceSource,
} from '@red-video-flow/workflow-core'
import type { PostgresDatabase } from './database.js'

export class PostgresResourceRepository {
  constructor(private readonly sql: PostgresDatabase) {}

  async list(input: {
    workspaceId?: string
    kind?: ResourceKind
    source?: ResourceSource
    query?: string
  }) {
    const pattern = input.query?.trim() ? `%${input.query.trim()}%` : null
    const rows = await this.sql`
      SELECT * FROM resources
      WHERE (${input.workspaceId ?? null}::text IS NULL OR workspace_id = ${input.workspaceId ?? null})
        AND deleted_at IS NULL
        AND (${input.kind ?? null}::text IS NULL OR kind = ${input.kind ?? null})
        AND (${input.source ?? null}::text IS NULL OR source = ${input.source ?? null})
        AND (
          ${pattern}::text IS NULL
          OR name ILIKE ${pattern}
          OR text_content ILIKE ${pattern}
        )
      ORDER BY updated_at DESC
    `
    return rows.map(toResource)
  }

  async get(id: string) {
    const rows = await this.sql`
      SELECT * FROM resources WHERE id = ${id} AND deleted_at IS NULL LIMIT 1
    `
    return rows[0] ? toResource(rows[0]) : undefined
  }

  async save(resource: Resource, blobId?: string) {
    await this.sql`
      INSERT INTO resources (
        id, workspace_id, kind, name, mime_type, text_content, blob_id, url,
        file_name, metadata, source, source_node_id, source_run_id,
        source_result_id, provider_id, model_id, prompt, generation_config,
        created_at, updated_at, deleted_at
      ) VALUES (
        ${resource.id}, ${resource.workspaceId}, ${resource.kind}, ${resource.name},
        ${resource.mimeType ?? null}, ${resource.text ?? null}, ${blobId ?? null},
        ${resource.url ?? null}, ${resource.fileName ?? null},
        ${this.sql.json(metadata(resource) as never)}, ${resource.source},
        ${resource.sourceNodeId ?? null}, ${resource.sourceRunId ?? null},
        ${resource.sourceResultId ?? null}, ${resource.providerId ?? null},
        ${resource.modelId ?? null}, ${resource.prompt ?? null},
        ${resource.generationConfig ? this.sql.json(resource.generationConfig as never) : null},
        ${resource.createdAt}, ${resource.updatedAt}, ${resource.deletedAt ?? null}
      )
      ON CONFLICT (id) DO UPDATE SET
        name = EXCLUDED.name,
        mime_type = EXCLUDED.mime_type,
        text_content = EXCLUDED.text_content,
        blob_id = EXCLUDED.blob_id,
        url = EXCLUDED.url,
        file_name = EXCLUDED.file_name,
        metadata = EXCLUDED.metadata,
        source = EXCLUDED.source,
        source_node_id = EXCLUDED.source_node_id,
        source_run_id = EXCLUDED.source_run_id,
        source_result_id = EXCLUDED.source_result_id,
        provider_id = EXCLUDED.provider_id,
        model_id = EXCLUDED.model_id,
        prompt = EXCLUDED.prompt,
        generation_config = EXCLUDED.generation_config,
        updated_at = EXCLUDED.updated_at,
        deleted_at = EXCLUDED.deleted_at
    `
    return resource
  }

  async softDelete(id: string) {
    const now = Date.now()
    await this.sql`
      UPDATE resources SET deleted_at = ${now}, updated_at = ${now} WHERE id = ${id}
    `
  }

  async bind(input: {
    resourceId: string
    workflowId: string
    nodeId?: string
    runId?: string
    resultId?: string
    relation: ResourceRelation
  }) {
    const createdAt = Date.now()
    const rows = await this.sql`
      INSERT INTO resource_bindings (
        id, resource_id, workflow_id, node_id, run_id, result_id, relation, created_at
      ) VALUES (
        ${randomUUID()}, ${input.resourceId}, ${input.workflowId},
        ${input.nodeId ?? null}, ${input.runId ?? null}, ${input.resultId ?? null},
        ${input.relation}, ${createdAt}
      )
      ON CONFLICT (
        resource_id, workflow_id, node_id, run_id, result_id, relation
      ) DO UPDATE SET resource_id = EXCLUDED.resource_id
      RETURNING *
    `
    return toBinding(rows[0])
  }

  async bindings(resourceId: string) {
    const rows = await this.sql`
      SELECT * FROM resource_bindings WHERE resource_id = ${resourceId}
    `
    return rows.map(toBinding)
  }
}

function metadata(resource: Resource) {
  return {
    size: resource.size,
    width: resource.width,
    height: resource.height,
    duration: resource.duration,
    thumbnailUrl: resource.thumbnailUrl,
  }
}

function toResource(row: Record<string, unknown>): Resource {
  const meta = (row.metadata ?? {}) as Record<string, unknown>
  return {
    id: String(row.id),
    workspaceId: String(row.workspace_id),
    kind: String(row.kind) as ResourceKind,
    name: String(row.name),
    mimeType: row.mime_type ? String(row.mime_type) : undefined,
    text: row.text_content ? String(row.text_content) : undefined,
    url: row.url ? String(row.url) : undefined,
    fileName: row.file_name ? String(row.file_name) : undefined,
    size: number(meta.size),
    width: number(meta.width),
    height: number(meta.height),
    duration: number(meta.duration),
    thumbnailUrl: string(meta.thumbnailUrl),
    source: String(row.source) as ResourceSource,
    sourceNodeId: row.source_node_id ? String(row.source_node_id) : undefined,
    sourceRunId: row.source_run_id ? String(row.source_run_id) : undefined,
    sourceResultId: row.source_result_id ? String(row.source_result_id) : undefined,
    providerId: row.provider_id ? String(row.provider_id) : undefined,
    modelId: row.model_id ? String(row.model_id) : undefined,
    prompt: row.prompt ? String(row.prompt) : undefined,
    generationConfig: row.generation_config as Record<string, unknown> | undefined,
    createdAt: Number(row.created_at),
    updatedAt: Number(row.updated_at),
    deletedAt: row.deleted_at ? Number(row.deleted_at) : undefined,
  }
}

function toBinding(row: Record<string, unknown>): ResourceBinding {
  return {
    id: String(row.id),
    resourceId: String(row.resource_id),
    workflowId: String(row.workflow_id),
    nodeId: row.node_id ? String(row.node_id) : undefined,
    runId: row.run_id ? String(row.run_id) : undefined,
    resultId: row.result_id ? String(row.result_id) : undefined,
    relation: String(row.relation) as ResourceRelation,
    createdAt: Number(row.created_at),
  }
}

function number(value: unknown) {
  return typeof value === 'number' ? value : undefined
}

function string(value: unknown) {
  return typeof value === 'string' ? value : undefined
}
