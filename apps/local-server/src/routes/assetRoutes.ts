import { handleBlobAssetRoutes } from '@red-video-flow/api-server'
import type { LocalServerRuntime } from '../runtime.js'
import { sendJson, type RequestContext } from '../http.js'
import { contentTypeFor } from '@red-video-flow/local-backend'
import { resolveRequestUser } from '../auth.js'

export async function handleAssetRoutes(runtime: LocalServerRuntime, ctx: RequestContext) {
  const { req, res, pathname, url } = ctx
  const { assets } = runtime.backend

  if (
    pathname === '/api/upload-asset'
    || pathname.startsWith('/api/blobs/')
  ) {
    const user = await resolveRequestUser(runtime, req)
    if (!user) {
      sendJson(res, 401, { error: 'SSO login is required' })
      return true
    }
    return handleBlobAssetRoutes(ctx, {
      userId: user.id,
      blobs: runtime.blobStorage,
      saveResource: async (resource, blobId) => {
        if (runtime.postgresInfrastructure) {
          await runtime.postgresInfrastructure.postgresResources.save(resource, blobId)
        }
        runtime.backend.resources.hydrate(resource)
      },
    })
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

  return false
}
