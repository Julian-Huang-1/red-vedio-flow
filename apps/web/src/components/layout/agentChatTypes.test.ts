import { describe, expect, it } from 'vitest'
import { applyAgentRunEvent, type ChatMessage } from './agentChatTypes'

describe('applyAgentRunEvent', () => {
  it('maps an Agent run into assistant message state without mixing stderr into the answer', () => {
    const initial: ChatMessage = {
      id: 'assistant-1',
      role: 'assistant',
      text: '',
      status: 'pending',
      createdAt: 100,
      updatedAt: 100,
      run: {
        agentId: 'codex',
        agentLabel: 'OpenAI Codex',
        stderr: [],
      },
    }

    const started = applyAgentRunEvent(
      initial,
      { type: 'start', agentId: 'codex', bin: '/usr/local/bin/codex', argv: ['exec', '--json'] },
      110,
    )
    const logged = applyAgentRunEvent(started, { type: 'stderr', text: 'plugin warning\n' }, 120)
    const streamed = applyAgentRunEvent(logged, { type: 'delta', text: '生成结果' }, 130)
    const completed = applyAgentRunEvent(
      streamed,
      { type: 'done', code: 0, output: '生成结果' },
      140,
    )

    expect(completed).toMatchObject({
      text: '生成结果',
      status: 'completed',
      updatedAt: 140,
      run: {
        agentId: 'codex',
        agentLabel: 'OpenAI Codex',
        bin: '/usr/local/bin/codex',
        argv: ['exec', '--json'],
        stderr: ['plugin warning\n'],
        exitCode: 0,
        startedAt: 110,
        finishedAt: 140,
      },
    })
  })

  it('marks non-zero completion as an error while preserving the output', () => {
    const message: ChatMessage = {
      id: 'assistant-1',
      role: 'assistant',
      text: '部分输出',
      status: 'streaming',
      createdAt: 100,
      updatedAt: 110,
    }

    expect(
      applyAgentRunEvent(message, { type: 'done', code: 2, output: '部分输出' }, 120),
    ).toMatchObject({
      text: '部分输出',
      status: 'error',
      error: 'Agent 退出码 2',
    })
  })
})
