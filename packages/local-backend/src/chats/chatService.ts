import { randomUUID } from 'node:crypto'
import {
  ChatRepository,
  type ChatMessageRecord,
  type ChatSessionRecord,
} from './chatRepository.js'

export class ChatService {
  constructor(private readonly repository: ChatRepository) {}

  list(query?: string, workflowId?: string) {
    return this.repository.list(query, workflowId)
  }

  get(id: string) {
    return this.repository.get(id)
  }

  create(input: { title?: string; workflowId?: string } = {}) {
    const now = Date.now()
    const session: ChatSessionRecord = {
      id: randomUUID(),
      title: input.title?.trim() || '新对话',
      workflowId: input.workflowId,
      createdAt: now,
      updatedAt: now,
    }
    return this.repository.create(session)
  }

  rename(id: string, title: string) {
    const next = title.trim()
    if (!next) throw new Error('chat title is required')
    return this.repository.rename(id, next, Date.now())
  }

  delete(id: string) {
    return this.repository.delete(id)
  }

  saveMessage(sessionId: string, input: Omit<ChatMessageRecord, 'sessionId'>) {
    if (!this.repository.get(sessionId)) throw new Error(`chat session not found: ${sessionId}`)
    const message = this.repository.saveMessage({ ...input, sessionId })
    const session = this.repository.get(sessionId)?.session
    if (session?.title === '新对话' && message.role === 'user' && message.text.trim()) {
      this.repository.rename(sessionId, createTitle(message.text), message.updatedAt)
    }
    return message
  }
}

function createTitle(text: string) {
  const normalized = text.trim().replace(/\s+/g, ' ')
  return normalized.length > 28 ? `${normalized.slice(0, 28)}…` : normalized
}
