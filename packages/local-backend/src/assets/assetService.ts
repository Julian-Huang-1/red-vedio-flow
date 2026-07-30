import { createReadStream, existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { extname, join, normalize, relative } from 'node:path'
import { randomUUID } from 'node:crypto'
import { desc, eq } from 'drizzle-orm'
import type { LocalDatabase } from '../db/client.js'
import { assets } from '../db/schema.js'
import type { ResourceService } from '../resources/resourceService.js'

export type UploadAssetInput = {
  fileName: string
  mimeType?: string
  bytes: Buffer
  workflowId: string
}

export type UploadedAsset = {
  id: string
  workflowId: string
  kind: string
  url: string
  localPath: string
  fileName: string
  mimeType?: string
  provider?: string
  createdAt: number
}

export class AssetService {
  readonly uploadDir: string
  readonly generatedDir: string

  constructor(
    private readonly dataDir: string,
    private readonly database: LocalDatabase,
    private readonly resources?: ResourceService,
  ) {
    this.uploadDir = join(dataDir, 'uploads')
    this.generatedDir = join(dataDir, 'generated')
    mkdirSync(this.uploadDir, { recursive: true })
    mkdirSync(this.generatedDir, { recursive: true })
  }

  upload(input: UploadAssetInput): UploadedAsset {
    const fileName = safeFileName(input.fileName)
    const storedName = `${Date.now()}-${Math.round(Math.random() * 10000)}-${fileName}`
    const filePath = join(this.uploadDir, storedName)
    writeFileSync(filePath, input.bytes)
    return this.register({
      workflowId: input.workflowId,
      kind: kindFromMimeType(input.mimeType),
      url: this.assetUrlForPath(filePath),
      localPath: filePath,
      fileName,
      mimeType: input.mimeType,
      source: 'upload',
    })
  }

  list(workflowId: string) {
    return this.database.db.select().from(assets)
      .where(eq(assets.workflowId, workflowId))
      .orderBy(desc(assets.createdAt))
      .all()
      .map(toUploadedAsset)
  }

  register(input: {
    workflowId: string
    kind: string
    url: string
    localPath: string
    fileName: string
    mimeType?: string
    provider?: string
    source?: 'upload' | 'generated' | 'imported'
    sourceNodeId?: string
    sourceRunId?: string
    sourceResultId?: string
    modelId?: string
    prompt?: string
    generationConfig?: Record<string, unknown>
  }): UploadedAsset {
    const existing = this.database.sqlite.prepare(
      `SELECT id FROM assets WHERE workflow_id = ? AND local_path = ? LIMIT 1`,
    ).get(input.workflowId, input.localPath) as { id: string } | undefined
    if (existing) {
      const row = this.database.db.select().from(assets).where(eq(assets.id, existing.id)).get()
      const asset = toUploadedAsset(row!)
      this.syncResource(asset, input)
      return asset
    }
    const record: typeof assets.$inferInsert = {
      id: randomUUID(),
      workflowId: input.workflowId,
      kind: input.kind,
      fileName: input.fileName,
      mimeType: input.mimeType,
      localPath: input.localPath,
      url: input.url,
      provider: input.provider,
      createdAt: Date.now(),
    }
    this.database.db.insert(assets).values(record).run()
    const asset = toUploadedAsset(record as typeof assets.$inferSelect)
    this.syncResource(asset, input)
    return asset
  }

  resolveAssetPath(assetUrl: string) {
    const rel = decodeURIComponent(assetUrl.replace('/api/assets/', ''))
    const filePath = normalize(join(this.dataDir, rel))
    if (!filePath.startsWith(this.dataDir) || !existsSync(filePath)) return undefined
    return filePath
  }

  createAssetReadStream(filePath: string) {
    return createReadStream(filePath)
  }

  assetUrlForPath(filePath: string) {
    const rel = relative(this.dataDir, filePath).split('/').map(encodeURIComponent).join('/')
    return `/api/assets/${rel}`
  }

  private syncResource(
    asset: UploadedAsset,
    input: {
      source?: 'upload' | 'generated' | 'imported'
      sourceNodeId?: string
      sourceRunId?: string
      sourceResultId?: string
      modelId?: string
      prompt?: string
      generationConfig?: Record<string, unknown>
    },
  ) {
    if (!this.resources || !asset.workflowId) return
    this.resources.upsertFile({
      id: asset.id,
      workspaceId: asset.workflowId,
      kind: asset.kind === 'image' || asset.kind === 'video' ? asset.kind : 'file',
      name: asset.fileName,
      mimeType: asset.mimeType,
      url: asset.url,
      localPath: asset.localPath,
      source: input.source ?? (asset.provider ? 'generated' : 'upload'),
      sourceNodeId: input.sourceNodeId,
      sourceRunId: input.sourceRunId,
      sourceResultId: input.sourceResultId,
      providerId: asset.provider,
      modelId: input.modelId,
      prompt: input.prompt,
      generationConfig: input.generationConfig,
    })
  }
}

function toUploadedAsset(row: typeof assets.$inferSelect): UploadedAsset {
  return {
    id: row.id,
    workflowId: row.workflowId ?? '',
    kind: row.kind,
    url: row.url,
    localPath: row.localPath,
    fileName: row.fileName,
    mimeType: row.mimeType ?? undefined,
    provider: row.provider ?? undefined,
    createdAt: row.createdAt,
  }
}

function kindFromMimeType(mimeType?: string) {
  if (mimeType?.startsWith('image/')) return 'image'
  if (mimeType?.startsWith('video/')) return 'video'
  return 'file'
}

export function contentTypeFor(filePath: string) {
  const ext = extname(filePath).toLowerCase()
  if (ext === '.html') return 'text/html; charset=utf-8'
  if (ext === '.js') return 'text/javascript; charset=utf-8'
  if (ext === '.css') return 'text/css; charset=utf-8'
  if (ext === '.json') return 'application/json; charset=utf-8'
  if (ext === '.svg') return 'image/svg+xml'
  if (ext === '.png') return 'image/png'
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg'
  if (ext === '.webp') return 'image/webp'
  if (ext === '.gif') return 'image/gif'
  if (ext === '.mp4') return 'video/mp4'
  if (ext === '.mov') return 'video/quicktime'
  return 'application/octet-stream'
}

function safeFileName(name: string) {
  return String(name || 'asset.bin').replace(/[^\w.-]+/g, '_')
}
