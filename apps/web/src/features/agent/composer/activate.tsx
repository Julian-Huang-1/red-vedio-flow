import { AgentComposer } from '../../../components/layout/AgentComposer'
import type { AgentDrawerController } from '../../../components/layout/AgentDrawer.logic'
import type { FrontendFeatureActivator } from '../../../extension-system/types'

function DefaultAgentComposerContribution({ drawer }: { drawer: AgentDrawerController }) {
  return (
    <AgentComposer
      value={drawer.prompt}
      nodes={drawer.nodes}
      agents={drawer.agents}
      agentStatus={drawer.agentStatus}
      selectedAgentId={drawer.selectedAgentId}
      hasSelectedNode={drawer.hasSelectedNode}
      isSending={drawer.isSending}
      onChange={drawer.setPrompt}
      onAgentChange={drawer.selectAgent}
      onSubmit={drawer.submit}
    />
  )
}

export const activate: FrontendFeatureActivator = (app) =>
  app.ui.contribute(
    'agent.drawer.composer',
    'agent.drawer.composer.default',
    DefaultAgentComposerContribution,
  )
