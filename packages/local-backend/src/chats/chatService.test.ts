import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { createLocalBackend } from '../context.js'

let dataDir: string | undefined

afterEach(() => {
  if (dataDir) rmSync(dataDir, { recursive: true, force: true })
  dataDir = undefined
})

describe('ChatService', () => {
  it('persists, titles, searches, renames and deletes conversations', () => {
    dataDir = mkdtempSync(join(tmpdir(), 'rvf-chat-test-'))
    const backend = createLocalBackend({ dataDir })
    const session = backend.chats.create({ workflowId: 'workflow-a' })
    backend.chats.create({ title: '另一个画布', workflowId: 'workflow-b' })
    const now = Date.now()

    backend.chats.saveMessage(session.id, {
      id: 'user-1',
      kind: 'text',
      role: 'user',
      text: '帮我规划一个旅行短视频',
      status: 'completed',
      createdAt: now,
      updatedAt: now,
    })
    backend.chats.saveMessage(session.id, {
      id: 'assistant-1',
      kind: 'text',
      role: 'assistant',
      text: '可以从目的地、节奏和镜头语言开始。',
      status: 'completed',
      agentId: 'codex',
      agentLabel: 'OpenAI Codex',
      modelId: 'gpt-5',
      createdAt: now + 1,
      updatedAt: now + 1,
    })

    expect(backend.chats.get(session.id)?.messages).toHaveLength(2)
    expect(backend.chats.list('旅行', 'workflow-a')[0]?.title).toContain('旅行')
    expect(backend.chats.list(undefined, 'workflow-a')).toHaveLength(1)
    expect(backend.chats.list(undefined, 'workflow-b')).toHaveLength(1)
    expect(backend.chats.rename(session.id, '旅行视频策划')?.title).toBe('旅行视频策划')
    expect(backend.chats.delete(session.id)).toBe(true)
    expect(backend.chats.get(session.id)).toBeUndefined()

    backend.database.sqlite.close()
  })
})
