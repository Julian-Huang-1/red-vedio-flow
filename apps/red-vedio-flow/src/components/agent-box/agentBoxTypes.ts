export type AgentRunStatus = 'idle' | 'submitting' | 'streaming' | 'stopping' | 'error'
export type AgentMessageStatus = 'completed' | 'streaming' | 'stopped' | 'error'
export type AgentMessageRole = 'user' | 'assistant'
export type AgentContextKind = 'node' | 'asset'

export type AgentOption = {
  id: string
  label: string
  description: string
}

export type AgentModelOption = {
  id: string
  label: string
  provider?: string
  modelId?: string
}

export type AgentAttachment = {
  id: string
  name: string
  mimeType: string
  size: number
}

export type AgentContextItem = {
  id: string
  kind: AgentContextKind
  title: string
}

export type AgentMessage = {
  id: string
  role: AgentMessageRole
  text: string
  status: AgentMessageStatus
  createdAt: number
  attachmentIds: string[]
}

export type AgentSession = {
  id: string
  title: string
  createdAt: number
  updatedAt: number
  messageIds: string[]
}
