export type LocalAgentModel = {
  id: string
  label: string
  available?: boolean
}

export type AgentModelDiscoverySource = 'agent' | 'cache' | 'manifest'
export type AgentModelDiscoveryConfidence = 'account' | 'cli' | 'inferred' | 'unknown'

export type AgentModelDiscovery = {
  models: LocalAgentModel[]
  defaultModelId?: string
  source: AgentModelDiscoverySource
  confidence: AgentModelDiscoveryConfidence
  discoveredAt?: string
  warning?: string
}

export type LocalAgent = {
  id: string
  label: string
  vendor: string
  protocol: string
  available: boolean
  invokable: boolean
  binPath?: string | null
  discoverySource?: 'registered' | 'path' | null
  registeredAt?: string
  fallbackModels: LocalAgentModel[]
  modelDiscovery?: AgentModelDiscovery
}

export type AgentStatus = 'idle' | 'loading' | 'ready' | 'error'
