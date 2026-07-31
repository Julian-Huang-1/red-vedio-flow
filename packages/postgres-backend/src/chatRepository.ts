import type { PostgresDatabase } from './database.js'

export type PostgresChatSession = {
  id: string
  ownerId?: string
  title: string
  workflowId?: string
  createdAt: number
  updatedAt: number
}

export type PostgresChatMessage = {
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

export class PostgresChatRepository {
  constructor(private readonly sql: PostgresDatabase) {}

  async list(ownerId: string, query?: string, workflowId?: string) {
    const pattern = query?.trim() ? `%${query.trim()}%` : null
    const rows = await this.sql`
      SELECT * FROM chat_sessions
      WHERE owner_id = ${ownerId}
        AND (${workflowId ?? null}::text IS NULL OR workflow_id = ${workflowId ?? null})
        AND (${pattern}::text IS NULL OR title ILIKE ${pattern})
      ORDER BY updated_at DESC
    `
    return rows.map(toSession)
  }

  async listAllSessions() {
    const rows = await this.sql`SELECT * FROM chat_sessions ORDER BY updated_at DESC`
    return rows.map(toSession)
  }

  async listAllMessages() {
    const rows = await this.sql`SELECT * FROM chat_messages ORDER BY created_at`
    return rows.map(toMessage)
  }

  async get(ownerId: string, id: string) {
    const sessions = await this.sql`
      SELECT * FROM chat_sessions WHERE id = ${id} AND owner_id = ${ownerId} LIMIT 1
    `
    if (!sessions[0]) return undefined
    const messages = await this.sql`
      SELECT * FROM chat_messages WHERE session_id = ${id} ORDER BY created_at
    `
    return { session: toSession(sessions[0]), messages: messages.map(toMessage) }
  }

  async saveSession(session: PostgresChatSession) {
    await this.sql`
      INSERT INTO chat_sessions (
        id, owner_id, title, workflow_id, created_at, updated_at
      ) VALUES (
        ${session.id}, ${session.ownerId ?? null}, ${session.title},
        ${session.workflowId ?? null}, ${session.createdAt}, ${session.updatedAt}
      )
      ON CONFLICT (id) DO UPDATE SET
        title = EXCLUDED.title,
        workflow_id = EXCLUDED.workflow_id,
        updated_at = EXCLUDED.updated_at
    `
    return session
  }

  async delete(ownerId: string | undefined, id: string) {
    const rows = await this.sql`
      DELETE FROM chat_sessions
      WHERE id = ${id}
        AND (${ownerId ?? null}::uuid IS NULL OR owner_id = ${ownerId ?? null})
      RETURNING id
    `
    return rows.length > 0
  }

  async saveMessage(message: PostgresChatMessage) {
    await this.sql`
      INSERT INTO chat_messages (
        id, session_id, kind, role, text, status, agent_id, agent_label,
        model_id, error, run, created_at, updated_at
      ) VALUES (
        ${message.id}, ${message.sessionId}, ${message.kind}, ${message.role},
        ${message.text}, ${message.status}, ${message.agentId ?? null},
        ${message.agentLabel ?? null}, ${message.modelId ?? null}, ${message.error ?? null},
        ${message.run === undefined ? null : this.sql.json(message.run as never)},
        ${message.createdAt}, ${message.updatedAt}
      )
      ON CONFLICT (id) DO UPDATE SET
        text = EXCLUDED.text,
        status = EXCLUDED.status,
        error = EXCLUDED.error,
        run = EXCLUDED.run,
        updated_at = EXCLUDED.updated_at
    `
    await this.sql`
      UPDATE chat_sessions SET updated_at = ${message.updatedAt}
      WHERE id = ${message.sessionId}
    `
    return message
  }
}

function toSession(row: Record<string, unknown>): PostgresChatSession {
  return {
    id: String(row.id),
    ownerId: row.owner_id ? String(row.owner_id) : undefined,
    title: String(row.title),
    workflowId: row.workflow_id ? String(row.workflow_id) : undefined,
    createdAt: Number(row.created_at),
    updatedAt: Number(row.updated_at),
  }
}

function toMessage(row: Record<string, unknown>): PostgresChatMessage {
  return {
    id: String(row.id),
    sessionId: String(row.session_id),
    kind: String(row.kind),
    role: String(row.role) as PostgresChatMessage['role'],
    text: String(row.text),
    status: String(row.status) as PostgresChatMessage['status'],
    agentId: row.agent_id ? String(row.agent_id) : undefined,
    agentLabel: row.agent_label ? String(row.agent_label) : undefined,
    modelId: row.model_id ? String(row.model_id) : undefined,
    error: row.error ? String(row.error) : undefined,
    run: row.run,
    createdAt: Number(row.created_at),
    updatedAt: Number(row.updated_at),
  }
}
