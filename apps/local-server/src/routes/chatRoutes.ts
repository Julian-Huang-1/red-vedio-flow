import {
  handleChatRoutes as handleSharedChatRoutes,
  type ChatApi,
  type ChatSession,
} from '@red-video-flow/api-server'
import type { LocalServerRuntime } from '../runtime.js'
import type { RequestContext } from '../http.js'
import { requireRequestUser } from '../auth.js'

export async function handleChatRoutes(
  runtime: LocalServerRuntime,
  ctx: RequestContext,
) {
  if (
    ctx.pathname !== '/api/chat-sessions'
    && !ctx.pathname.startsWith('/api/chat-sessions/')
  ) return false
  const user = await requireRequestUser(runtime, ctx.req)
  const repository = runtime.backend.chatRepository
  const chats: ChatApi = {
    list: (_userId, query, workflowId) => runtime.backend.chats.list(query, workflowId),
    get: (_userId, sessionId) => runtime.backend.chats.get(sessionId),
    saveSession: (session) => saveSession(repository, session),
    delete: (_userId, sessionId) => repository.delete(sessionId),
    saveMessage: (message) => repository.saveMessage(message),
  }
  return handleSharedChatRoutes(ctx, { userId: user.id, chats })
}

function saveSession(
  repository: LocalServerRuntime['backend']['chatRepository'],
  session: ChatSession,
) {
  const existing = repository.get(session.id)
  if (existing) {
    return repository.rename(session.id, session.title, session.updatedAt) ?? session
  }
  const { ownerId: _, ...localSession } = session
  return repository.create(localSession)
}
