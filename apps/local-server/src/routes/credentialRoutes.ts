import type { LocalServerRuntime } from '../runtime.js'
import { readJson, sendJson, type RequestContext } from '../http.js'
import { requireRequestUser } from '../auth.js'

export async function handleCredentialRoutes(runtime: LocalServerRuntime, ctx: RequestContext) {
  const { req, res, pathname } = ctx
  if (pathname !== '/api/settings/model-credential') return false

  const user = await requireRequestUser(runtime, req)
  if (req.method === 'GET') {
    sendJson(res, 200, await runtime.backend.credentials.getStatus(user.id))
    return true
  }
  if (req.method === 'PUT') {
    const body = await readJson(req)
    const token = typeof body.token === 'string' ? body.token : ''
    if (!token.trim()) {
      sendJson(res, 400, { error: 'token is required' })
      return true
    }
    sendJson(res, 200, await runtime.backend.credentials.setModelToken(user.id, token))
    return true
  }
  if (req.method === 'DELETE') {
    await runtime.backend.credentials.deleteModelToken(user.id)
    sendJson(res, 200, { configured: false })
    return true
  }
  sendJson(res, 405, { error: 'method not allowed' })
  return true
}
