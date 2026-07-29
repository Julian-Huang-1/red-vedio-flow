import { create } from 'zustand'
import type { ChatMessage } from '../components/layout/agentChatTypes'

type MessageUpdater = ChatMessage[] | ((messages: ChatMessage[]) => ChatMessage[])

type AgentSessionState = {
  prompt: string
  messages: ChatMessage[]
  isSending: boolean
  executionId?: string
  sessionId?: string
  selectedModelId?: string
  setPrompt: (prompt: string) => void
  setMessages: (messages: MessageUpdater) => void
  setSending: (isSending: boolean) => void
  setExecutionId: (executionId?: string) => void
  setSessionId: (sessionId?: string) => void
  setSelectedModelId: (modelId?: string) => void
  reset: () => void
}

export const useAgentSessionStore = create<AgentSessionState>((set) => ({
  prompt: '',
  messages: [],
  isSending: false,
  executionId: undefined,
  sessionId: undefined,
  selectedModelId: undefined,

  setPrompt: (prompt) => set({ prompt }),
  setMessages: (messages) =>
    set((state) => ({
      messages: typeof messages === 'function' ? messages(state.messages) : messages,
    })),
  setSending: (isSending) => set({ isSending }),
  setExecutionId: (executionId) => set({ executionId }),
  setSessionId: (sessionId) => set({ sessionId }),
  setSelectedModelId: (selectedModelId) => set({ selectedModelId }),
  reset: () => set({
    prompt: '',
    messages: [],
    isSending: false,
    executionId: undefined,
    sessionId: undefined,
  }),
}))
