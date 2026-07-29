import type { LocalServerRuntime } from '../runtime.js'
import { readBuffer, sendJson, type RequestContext } from '../http.js'
import { contentTypeFor } from '@red-video-flow/local-backend'

export async function handleAssetRoutes(runtime: LocalServerRuntime, ctx: RequestContext) {
  const { req, res, pathname, url } = ctx
  const { assets } = runtime.backend

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
    sendJson(res, 200, assets.upload({
      fileName,
      mimeType,
      bytes: await readBuffer(req),
    }))
    return true
  }

  return false
}
