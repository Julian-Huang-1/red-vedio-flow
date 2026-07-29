import { and, asc, desc, eq, like, or } from 'drizzle-orm'
import type { LocalDatabase } from '../db/client.js'
import { chatMessages, chatSessions } from '../db/schema.js'

export type ChatSessionRecord = {
  id: string
  title: string
  workflowId?: string
  createdAt: number
  updatedAt: number
}

export type ChatMessageRecord = {
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

export class ChatRepository {
  constructor(private readonly database: LocalDatabase) {}

  list(query?: string, workflowId?: string) {
    const pattern = query?.trim() ? `%${query.trim()}%` : undefined
    const searchCondition = pattern
      ? or(like(chatSessions.title, pattern), like(chatSessions.id, pattern))
      : undefined
    return this.database.db.select().from(chatSessions)
      .where(and(
        workflowId ? eq(chatSessions.workflowId, workflowId) : undefined,
        searchCondition,
      ))
      .orderBy(desc(chatSessions.updatedAt))
      .all()
      .map(toSession)
  }

  get(id: string) {
    const session = this.database.db.select().from(chatSessions)
      .where(eq(chatSessions.id, id)).get()
    if (!session) return undefined
    const messages = this.database.db.select().from(chatMessages)
      .where(eq(chatMessages.sessionId, id))
      .orderBy(asc(chatMessages.createdAt))
      .all()
      .map(toMessage)
    return { session: toSession(session), messages }
  }

  create(session: ChatSessionRecord) {
    this.database.db.insert(chatSessions).values({
      ...session,
      workflowId: session.workflowId ?? null,
    }).run()
    return session
  }

  rename(id: string, title: string, updatedAt: number) {
    this.database.db.update(chatSessions)
      .set({ title, updatedAt })
      .where(eq(chatSessions.id, id))
      .run()
    return this.get(id)?.session
  }

  touch(id: string, updatedAt: number) {
    this.database.db.update(chatSessions).set({ updatedAt }).where(eq(chatSessions.id, id)).run()
  }

  delete(id: string) {
    return this.database.db.delete(chatSessions).where(eq(chatSessions.id, id)).run().changes > 0
  }

  saveMessage(message: ChatMessageRecord) {
    const values = {
      id: message.id,
      sessionId: message.sessionId,
      kind: message.kind,
      role: message.role,
      text: message.text,
      status: message.status,
      agentId: message.agentId ?? null,
      agentLabel: message.agentLabel ?? null,
      modelId: message.modelId ?? null,
      error: message.error ?? null,
      runJson: message.run === undefined ? null : JSON.stringify(message.run),
      createdAt: message.createdAt,
      updatedAt: message.updatedAt,
    }
    this.database.db.insert(chatMessages).values(values)
      .onConflictDoUpdate({ target: chatMessages.id, set: values }).run()
    this.touch(message.sessionId, message.updatedAt)
    return message
  }
}

function toSession(row: typeof chatSessions.$inferSelect): ChatSessionRecord {
  return {
    id: row.id,
    title: row.title,
    workflowId: row.workflowId ?? undefined,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
}

function toMessage(row: typeof chatMessages.$inferSelect): ChatMessageRecord {
  return {
    id: row.id,
    sessionId: row.sessionId,
    kind: row.kind,
    role: row.role as ChatMessageRecord['role'],
    text: row.text,
    status: row.status as ChatMessageRecord['status'],
    agentId: row.agentId ?? undefined,
    agentLabel: row.agentLabel ?? undefined,
    modelId: row.modelId ?? undefined,
    error: row.error ?? undefined,
    run: row.runJson ? JSON.parse(row.runJson) : undefined,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
}
