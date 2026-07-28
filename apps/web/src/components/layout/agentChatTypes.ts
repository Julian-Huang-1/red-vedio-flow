import type { AgentRunEvent } from '@red-video-flow/workflow-client'

export type ChatMessageStatus = 'pending' | 'streaming' | 'completed' | 'error'

export type AgentRunSummary = {
  agentId: string
  agentLabel: string
  bin?: string
  argv?: string[]
  stderr: string[]
  exitCode?: number | null
  startedAt?: number
  finishedAt?: number
}

export type ChatMessage = {
  id: string
  role: 'user' | 'assistant'
  text: string
  status: ChatMessageStatus
  createdAt: number
  updatedAt: number
  error?: string
  run?: AgentRunSummary
}

export function applyAgentRunEvent(message: ChatMessage, event: AgentRunEvent, receivedAt = Date.now()): ChatMessage {
  if (message.role !== 'assistant') return message

  const run = message.run ?? {
    agentId: event.type === 'start' ? event.agentId : 'unknown',
    agentLabel: event.type === 'start' ? event.agentId : '本地 Agent',
    stderr: [],
  }

  switch (event.type) {
    case 'start':
      return {
        ...message,
        status: 'streaming',
        updatedAt: receivedAt,
        run: {
          ...run,
          agentId: event.agentId,
          bin: event.bin,
          argv: event.argv,
          startedAt: receivedAt,
        },
      }
    case 'stderr':
      return {
        ...message,
        updatedAt: receivedAt,
        run: {
          ...run,
          stderr: [...run.stderr, event.text],
        },
      }
    case 'delta':
      return {
        ...message,
        text: `${message.text}${event.text}`,
        status: 'streaming',
        updatedAt: receivedAt,
        run,
      }
    case 'done': {
      const succeeded = event.code === null || event.code === 0
      return {
        ...message,
        text: event.output || message.text,
        status: succeeded ? 'completed' : 'error',
        updatedAt: receivedAt,
        error: succeeded ? undefined : `Agent 退出码 ${event.code}`,
        run: {
          ...run,
          exitCode: event.code,
          finishedAt: receivedAt,
        },
      }
    }
    case 'error':
      return {
        ...message,
        status: 'error',
        updatedAt: receivedAt,
        error: event.message,
        run: {
          ...run,
          finishedAt: receivedAt,
        },
      }
  }
}
