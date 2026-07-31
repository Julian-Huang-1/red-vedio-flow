import { randomUUID } from 'node:crypto'
import {
  HttpError,
  optionalString,
  pathParts,
  readJson,
  sendJson,
  type RequestContext,
} from './http.js'

type Awaitable<T> = T | Promise<T>

export type ChatSession = {
  id: string
  ownerId?: string
  title: string
  workflowId?: string
  createdAt: number
  updatedAt: number
}

export type ChatMessage = {
  id: string
  sessionId: string
  kind: string
  role: 'user' | 'assistant'
  text: string
  status: 'pending' | 'streaming' | 'completed' | 'error'
  agentId?: string
  agentLabel?: string
  modelId?: string
  error?: string
  run?: unknown
  createdAt: number
  updatedAt: number
}

export type ChatApi = {
  list(userId: string, query?: string, workflowId?: string): Awaitable<ChatSession[]>
  get(
    userId: string,
    sessionId: string,
  ): Awaitable<{ session: ChatSession; messages: ChatMessage[] } | undefined>
  saveSession(session: ChatSession): Awaitable<ChatSession>
  delete(userId: string, sessionId: string): Awaitable<boolean>
  saveMessage(message: ChatMessage): Awaitable<ChatMessage>
}

export async function handleChatRoutes(
  ctx: RequestContext,
  input: {
    userId: string
    chats: ChatApi
  },
) {
  const { chats, userId } = input
  if (ctx.pathname === '/api/chat-sessions' && ctx.req.method === 'GET') {
    const workflowId = ctx.url.searchParams.get('workflowId')?.trim()
    if (!workflowId) throw new HttpError(400, 'workflowId is required')
    sendJson(ctx.res, 200, {
      sessions: await chats.list(
        userId,
        ctx.url.searchParams.get('q') ?? undefined,
        workflowId,
      ),
    })
    return true
  }
  if (ctx.pathname === '/api/chat-sessions' && ctx.req.method === 'POST') {
    const body = await readJson(ctx.req)
    const now = Date.now()
    const session = await chats.saveSession({
      id: randomUUID(),
      ownerId: userId,
      title: typeof body.title === 'string' && body.title.trim()
        ? body.title.trim()
        : '新对话',
      workflowId: optionalString(body.workflowId),
      createdAt: now,
      updatedAt: now,
    })
    sendJson(ctx.res, 200, { session })
    return true
  }

  const route = pathParts(ctx.pathname, '/api/chat-sessions/')
  if (!route?.length) return false
  const result = await chats.get(userId, route[0])
  if (!result) throw new HttpError(404, `chat session not found: ${route[0]}`)
  if (route.length === 1 && ctx.req.method === 'GET') {
    sendJson(ctx.res, 200, result)
    return true
  }
  if (route.length === 1 && ctx.req.method === 'PATCH') {
    const body = await readJson(ctx.req)
    if (typeof body.title !== 'string' || !body.title.trim()) {
      throw new HttpError(400, 'title is required')
    }
    const session = await chats.saveSession({
      ...result.session,
      title: body.title.trim(),
      updatedAt: Date.now(),
    })
    sendJson(ctx.res, 200, { session })
    return true
  }
  if (route.length === 1 && ctx.req.method === 'DELETE') {
    sendJson(ctx.res, 200, { ok: await chats.delete(userId, route[0]) })
    return true
  }
  if (route.length === 2 && route[1] === 'messages' && ctx.req.method === 'POST') {
    const body = await readJson(ctx.req)
    if (
      typeof body.id !== 'string'
      || (body.role !== 'user' && body.role !== 'assistant')
      || typeof body.text !== 'string'
      || !chatStatus(body.status)
      || typeof body.createdAt !== 'number'
      || typeof body.updatedAt !== 'number'
    ) {
      throw new HttpError(400, 'invalid chat message')
    }
    const message = await chats.saveMessage({
      id: body.id,
      sessionId: route[0],
      kind: typeof body.kind === 'string' ? body.kind : 'text',
      role: body.role,
      text: body.text,
      status: body.status,
      agentId: optionalString(body.agentId),
      agentLabel: optionalString(body.agentLabel),
      modelId: optionalString(body.modelId),
      error: optionalString(body.error),
      run: body.run,
      createdAt: body.createdAt,
      updatedAt: body.updatedAt,
    })
    sendJson(ctx.res, 200, { message })
    return true
  }
  return false
}

function chatStatus(
  value: unknown,
): value is ChatMessage['status'] {
  return value === 'pending'
    || value === 'streaming'
    || value === 'completed'
    || value === 'error'
}
