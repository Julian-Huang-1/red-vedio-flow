import { create } from 'zustand'
import type { AgentStatus, LocalAgent } from '@red-video-flow/workflow-core'
import type { AgentListResponse } from '@red-video-flow/workflow-client'

type AgentCatalogState = {
  agents: LocalAgent[]
  selectedAgentId?: string
  status: AgentStatus
  error?: string
  applyResponse: (response: AgentListResponse) => void
  setQueryStatus: (status: AgentStatus, error?: string) => void
  selectAgent: (agentId: string) => void
}

export const useAgentCatalogStore = create<AgentCatalogState>((set, get) => ({
  agents: [],
  selectedAgentId: undefined,
  status: 'idle',
  error: undefined,

  applyResponse: (response) => {
    const invokable = response.agents.find((agent) => agent.invokable)
    const currentSelected = get().selectedAgentId
    const stillAvailable = response.agents.some(
      (agent) => agent.id === currentSelected && agent.invokable,
    )

    set({
      agents: response.agents,
      selectedAgentId: stillAvailable ? currentSelected : invokable?.id,
      status: 'ready',
      error: undefined,
    })
  },

  setQueryStatus: (status, error) => set({ status, error }),
  selectAgent: (agentId) => set({ selectedAgentId: agentId }),
}))
