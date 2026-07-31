import {
  HttpError,
  readJson,
  sendJson,
  type RequestContext,
} from './http.js'

type Awaitable<T> = T | Promise<T>

export type ModelCredentialStore = {
  getStatus(userId: string): Awaitable<unknown>
  setModelToken(userId: string, token: string): Awaitable<unknown>
  deleteModelToken(userId: string): Awaitable<unknown>
}

export async function handleModelCredentialRoute(
  ctx: RequestContext,
  input: {
    userId: string
    credentials: ModelCredentialStore
  },
) {
  if (ctx.pathname !== '/api/settings/model-credential') return false
  if (ctx.req.method === 'GET') {
    sendJson(ctx.res, 200, await input.credentials.getStatus(input.userId))
    return true
  }
  if (ctx.req.method === 'PUT') {
    const body = await readJson(ctx.req)
    if (typeof body.token !== 'string' || !body.token.trim()) {
      throw new HttpError(400, 'token is required')
    }
    sendJson(
      ctx.res,
      200,
      await input.credentials.setModelToken(input.userId, body.token),
    )
    return true
  }
  if (ctx.req.method === 'DELETE') {
    await input.credentials.deleteModelToken(input.userId)
    sendJson(ctx.res, 200, { configured: false })
    return true
  }
  throw new HttpError(405, 'method not allowed')
}
