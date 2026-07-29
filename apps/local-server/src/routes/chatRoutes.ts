import type { LocalServerRuntime } from '../runtime.js'
import { readJson, resourcePath, sendJson, type RequestContext } from '../http.js'

export async function handleChatRoutes(runtime: LocalServerRuntime, ctx: RequestContext) {
  const { req, res, pathname, url } = ctx
  const chats = runtime.backend.chats

  if (pathname === '/api/chat-sessions' && req.method === 'GET') {
    const workflowId = url.searchParams.get('workflowId')?.trim()
    if (!workflowId) {
      sendJson(res, 400, { error: 'workflowId is required' })
      return true
    }
    sendJson(res, 200, {
      sessions: chats.list(url.searchParams.get('q') ?? undefined, workflowId),
    })
    return true
  }
  if (pathname === '/api/chat-sessions' && req.method === 'POST') {
    const body = await readJson(req)
    sendJson(res, 200, {
      session: chats.create({
        title: typeof body.title === 'string' ? body.title : undefined,
        workflowId: typeof body.workflowId === 'string' ? body.workflowId : undefined,
      }),
    })
    return true
  }

  const parts = resourcePath(pathname, '/api/chat-sessions/')
  if (!parts?.length) return false
  const sessionId = parts[0]

  if (parts.length === 1 && req.method === 'GET') {
    const result = chats.get(sessionId)
    if (!result) {
      sendJson(res, 404, { error: `chat session not found: ${sessionId}` })
      return true
    }
    sendJson(res, 200, result)
    return true
  }
  if (parts.length === 1 && req.method === 'PATCH') {
    const body = await readJson(req)
    if (typeof body.title !== 'string') {
      sendJson(res, 400, { error: 'title is required' })
      return true
    }
    const session = chats.rename(sessionId, body.title)
    if (!session) {
      sendJson(res, 404, { error: `chat session not found: ${sessionId}` })
      return true
    }
    sendJson(res, 200, { session })
    return true
  }
  if (parts.length === 1 && req.method === 'DELETE') {
    sendJson(res, 200, { ok: chats.delete(sessionId) })
    return true
  }
  if (parts.length === 2 && parts[1] === 'messages' && req.method === 'POST') {
    const body = await readJson(req)
    if (
      typeof body.id !== 'string'
      || (body.role !== 'user' && body.role !== 'assistant')
      || typeof body.text !== 'string'
      || typeof body.status !== 'string'
      || typeof body.createdAt !== 'number'
      || typeof body.updatedAt !== 'number'
    ) {
      sendJson(res, 400, { error: 'invalid chat message' })
      return true
    }
    sendJson(res, 200, {
      message: chats.saveMessage(sessionId, {
        id: body.id,
        kind: typeof body.kind === 'string' ? body.kind : 'text',
        role: body.role,
        text: body.text,
        status: body.status,
        agentId: typeof body.agentId === 'string' ? body.agentId : undefined,
        agentLabel: typeof body.agentLabel === 'string' ? body.agentLabel : undefined,
        modelId: typeof body.modelId === 'string' ? body.modelId : undefined,
        error: typeof body.error === 'string' ? body.error : undefined,
        run: body.run,
        createdAt: body.createdAt,
        updatedAt: body.updatedAt,
      }),
    })
    return true
  }
  return false
}
