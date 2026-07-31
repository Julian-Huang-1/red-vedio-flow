import type { LocalServerRuntime } from '../runtime.js'
import { handleModelCredentialRoute } from '@red-video-flow/api-server'
import type { RequestContext } from '../http.js'
import { requireRequestUser } from '../auth.js'

export async function handleCredentialRoutes(runtime: LocalServerRuntime, ctx: RequestContext) {
  if (ctx.pathname !== '/api/settings/model-credential') return false
  const user = await requireRequestUser(runtime, ctx.req)
  return handleModelCredentialRoute(ctx, {
    userId: user.id,
    credentials: runtime.backend.credentials,
  })
}
