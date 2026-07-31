import type { LocalServerRuntime } from '../runtime.js'
import { readBuffer, sendJson, type RequestContext } from '../http.js'
import { contentTypeFor } from '@red-video-flow/local-backend'
import { resolveRequestUser } from '../auth.js'

export async function handleAssetRoutes(runtime: LocalServerRuntime, ctx: RequestContext) {
  const { req, res, pathname, url } = ctx
  const { assets } = runtime.backend

  const blobMatch = pathname.match(/^\/api\/blobs\/([^/]+)$/)
  if (req.method === 'GET' && blobMatch && runtime.postgresInfrastructure) {
    const user = await resolveRequestUser(runtime, req)
    if (!user) {
      sendJson(res, 401, { error: 'SSO login is required' })
      return true
    }
    const blobId = decodeURIComponent(blobMatch[1])
    const blob = await runtime.postgresInfrastructure.blobs.statForOwner(blobId, user.id)
    if (!blob) {
      sendJson(res, 404, { error: 'asset not found' })
      return true
    }
    const range = parseRange(req.headers.range, blob.size)
    const body = await runtime.postgresInfrastructure.blobs.readForOwner(blobId, user.id, range)
    res.writeHead(range ? 206 : 200, {
      'Content-Type': blob.contentType ?? 'application/octet-stream',
      'Content-Length': String(range ? range.end - range.start + 1 : blob.size),
      'Accept-Ranges': 'bytes',
      ...(range ? { 'Content-Range': `bytes ${range.start}-${range.end}/${blob.size}` } : {}),
    })
    for await (const chunk of body) res.write(chunk)
    res.end()
    return true
  }

  if (req.method === 'GET' && pathname === '/api/assets') {
    const workflowId = url.searchParams.get('workflowId')?.trim()
    if (!workflowId) {
      sendJson(res, 400, { error: 'workflowId is required' })
      return true
    }
    sendJson(res, 200, { assets: assets.list(workflowId) })
    return true
  }

  if (req.method === 'GET' && pathname.startsWith('/api/assets/')) {
    const filePath = assets.resolveAssetPath(pathname)
    if (!filePath) {
      sendJson(res, 404, { error: 'asset not found' })
      return true
    }
    res.writeHead(200, {
      'Content-Type': contentTypeFor(filePath),
      'Access-Control-Allow-Origin': '*',
    })
    assets.createAssetReadStream(filePath).pipe(res)
    return true
  }

  if (req.method === 'POST' && pathname === '/api/upload-asset') {
    const fileName = url.searchParams.get('fileName') ?? 'asset.bin'
    const mimeType = url.searchParams.get('mimeType') ?? undefined
    const workflowId = url.searchParams.get('workflowId')?.trim()
    if (!workflowId) {
      sendJson(res, 400, { error: 'workflowId is required' })
      return true
    }
    if (runtime.postgresInfrastructure) {
      const user = await resolveRequestUser(runtime, req)
      if (!user) {
        sendJson(res, 401, { error: 'SSO login is required' })
        return true
      }
      const bytes = await readBuffer(req)
      const blob = await runtime.postgresInfrastructure.blobs.put({
        ownerId: user.id,
        fileName,
        contentType: mimeType,
        size: bytes.length,
        body: (async function* () { yield bytes })(),
      })
      const kind = mimeType?.startsWith('video/')
        ? 'video'
        : mimeType?.startsWith('image/')
          ? 'image'
          : 'file'
      sendJson(res, 200, {
        ...runtime.postgresInfrastructure.blobs.toAssetReference(blob, kind),
        workflowId,
        fileName,
        mimeType,
      })
      return true
    }
    sendJson(res, 200, assets.upload({
      fileName,
      mimeType,
      workflowId,
      bytes: await readBuffer(req),
    }))
    return true
  }

  return false
}

function parseRange(header: string | undefined, size: number) {
  if (!header) return undefined
  const match = header.match(/^bytes=(\d+)-(\d*)$/)
  if (!match) return undefined
  const start = Number(match[1])
  const end = match[2] ? Number(match[2]) : size - 1
  if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end < start || end >= size) {
    return undefined
  }
  return { start, end }
}
