import { randomUUID } from 'node:crypto'
import type {
  BlobStorage,
  Resource,
  ResourceKind,
} from '@red-video-flow/workflow-core'
import {
  HttpError,
  pathParts,
  readBuffer,
  sendJson,
  type RequestContext,
} from './http.js'

export type BlobAssetApi = {
  userId: string
  blobs: BlobStorage
  saveResource(resource: Resource, blobId: string): Promise<unknown>
  publishAsset?(input: {
    bytes: Buffer
    fileName: string
    mimeType?: string
  }): Promise<string | undefined>
  requirePublishedAsset?(input: { kind: ResourceKind; mimeType?: string }): boolean
  onPublishAssetError?(error: unknown): void | Promise<void>
  onResourceSaved?(resource: Resource): void | Promise<void>
}

export async function handleBlobAssetRoutes(
  ctx: RequestContext,
  api: BlobAssetApi,
) {
  const { req, res, pathname, url } = ctx
  if (pathname === '/api/upload-asset' && req.method === 'POST') {
    const workflowId = url.searchParams.get('workflowId')?.trim()
    if (!workflowId) throw new HttpError(400, 'workflowId is required')
    const fileName = url.searchParams.get('fileName') ?? 'asset.bin'
    const mimeType = url.searchParams.get('mimeType') ?? undefined
    const bytes = await readBuffer(req)
    const blob = await api.blobs.put({
      ownerId: api.userId,
      fileName,
      contentType: mimeType,
      size: bytes.length,
      body: (async function* () { yield bytes })(),
    })
    const kind: ResourceKind = mimeType?.startsWith('video/')
      ? 'video'
      : mimeType?.startsWith('image/')
        ? 'image'
        : 'file'
    const publishRequired = api.requirePublishedAsset?.({ kind, mimeType }) ?? false
    let publicUrl: string | undefined
    try {
      publicUrl = await api.publishAsset?.({ bytes, fileName, mimeType })
    } catch (error) {
      await api.onPublishAssetError?.(error)
      if (publishRequired) {
        await api.blobs.delete(blob.id).catch(() => undefined)
        throw error
      }
    }
    if (publishRequired && !publicUrl) {
      await api.blobs.delete(blob.id).catch(() => undefined)
      throw new Error('视频上传未返回公网 CDN URL')
    }
    const asset = {
      ...api.blobs.toAssetReference(blob, kind),
      ...(publicUrl ? { url: publicUrl } : {}),
    }
    const now = Date.now()
    const resource: Resource = {
      id: randomUUID(),
      workspaceId: workflowId,
      kind,
      name: fileName,
      mimeType,
      url: asset.url,
      fileName,
      size: bytes.length,
      source: 'upload',
      createdAt: now,
      updatedAt: now,
    }
    await api.saveResource(resource, blob.id)
    await api.onResourceSaved?.(resource)
    sendJson(res, 200, {
      ...asset,
      id: resource.id,
      resourceId: resource.id,
      blobId: blob.id,
      workflowId,
      fileName,
      mimeType,
    })
    return true
  }

  const route = pathParts(pathname, '/api/blobs/')
  if (!route?.length || req.method !== 'GET') return false
  const blob = await api.blobs.statForOwner(route[0], api.userId)
  if (!blob) throw new HttpError(404, 'asset not found')
  const range = parseRange(req.headers.range, blob.size)
  const body = await api.blobs.readForOwner(route[0], api.userId, range)
  res.writeHead(range ? 206 : 200, {
    'Content-Type': blob.contentType ?? 'application/octet-stream',
    'Content-Length': String(range ? range.end - range.start + 1 : blob.size),
    'Accept-Ranges': 'bytes',
    ...(range
      ? { 'Content-Range': `bytes ${range.start}-${range.end}/${blob.size}` }
      : {}),
  })
  for await (const chunk of body) res.write(chunk)
  res.end()
  return true
}

function parseRange(header: string | undefined, size: number) {
  const match = header?.match(/^bytes=(\d+)-(\d*)$/)
  if (!match) return undefined
  const start = Number(match[1])
  const end = match[2] ? Number(match[2]) : size - 1
  return Number.isInteger(start)
    && Number.isInteger(end)
    && start >= 0
    && end >= start
    && end < size
    ? { start, end }
    : undefined
}
