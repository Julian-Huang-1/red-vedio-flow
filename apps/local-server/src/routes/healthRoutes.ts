import type { LocalServerRuntime } from '../runtime.js'
import { sendJson, type RequestContext } from '../http.js'

export async function handleHealthRoutes(runtime: LocalServerRuntime, ctx: RequestContext) {
  if (ctx.req.method !== 'GET') return false
  if (ctx.pathname === '/api/health/live') {
    sendJson(ctx.res, 200, { status: 'ok' })
    return true
  }
  if (ctx.pathname === '/api/health/ready') {
    try {
      if (runtime.postgresDatabase) await runtime.postgresDatabase`SELECT 1`
      sendJson(ctx.res, 200, {
        status: 'ready',
        database: runtime.postgresDatabase ? 'postgresql' : 'sqlite',
      })
    } catch {
      sendJson(ctx.res, 503, { status: 'not_ready' })
    }
    return true
  }
  return false
}
