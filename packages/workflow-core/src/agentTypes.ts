export type LocalAgentModel = {
  id: string
  label: string
}

export type LocalAgent = {
  id: string
  label: string
  vendor: string
  protocol: string
  available: boolean
  invokable: boolean
  binPath?: string | null
  fallbackModels: LocalAgentModel[]
}

export type AgentStatus = 'idle' | 'loading' | 'ready' | 'error'
