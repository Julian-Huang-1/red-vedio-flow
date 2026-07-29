import { AgentBox } from './AgentBox'
import { useAgentBoxStore } from './agentBoxStore'
import {
  AgentBoxComposer,
  AgentBoxContext,
  AgentBoxHeader,
  AgentBoxHistory,
  AgentBoxMessages,
  AgentBoxServerState,
} from './panel'

export function AgentBoxPanel() {
  const runStatus = useAgentBoxStore((state) => state.runStatus)

  return (
    <AgentBox.Root
      data-running={runStatus !== 'idle' && runStatus !== 'error' ? '' : undefined}
      data-error={runStatus === 'error' ? '' : undefined}
    >
      <AgentBoxServerState />
      <AgentBoxHeader />
      <AgentBoxContext />
      <AgentBoxMessages />
      <AgentBoxComposer />
      <AgentBoxHistory />
    </AgentBox.Root>
  )
}
