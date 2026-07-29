import { AgentComposer } from '../../../components/layout/AgentComposer'
import { AgentRegistrationPrompt } from '../../../components/layout/AgentRegistrationPrompt'
import type { AgentDrawerController } from '../../../components/layout/AgentDrawer.logic'
import type { FrontendFeatureActivator } from '../../../extension-system/types'

function DefaultAgentComposerContribution({ drawer }: { drawer: AgentDrawerController }) {
  return (
    <AgentComposer
      value={drawer.prompt}
      nodes={drawer.nodes}
      agents={drawer.agents}
      availableModels={drawer.availableModels}
      modelDiscovery={drawer.modelDiscovery}
      isDiscoveringModels={drawer.isDiscoveringModels}
      agentStatus={drawer.agentStatus}
      selectedAgentId={drawer.selectedAgentId}
      selectedModelId={drawer.selectedModelId}
      hasSelectedNode={drawer.hasSelectedNode}
      isSending={drawer.isSending}
      onChange={drawer.setPrompt}
      onAgentChange={drawer.selectAgent}
      onModelChange={drawer.selectModel}
      onRefreshModels={drawer.refreshModels}
      onSubmit={drawer.submit}
    />
  )
}

function AgentRegistrationContribution({ drawer }: { drawer: AgentDrawerController }) {
  return (
    <AgentRegistrationPrompt
      agents={drawer.agents}
      isCopying={drawer.isCopyingRegistrationPrompt}
      copiedAgentId={drawer.copiedAgentId}
      error={drawer.registrationError}
      onCopy={drawer.copyRegistrationPrompt}
    />
  )
}

export const activate: FrontendFeatureActivator = (app) => {
  const registrations = [
    app.ui.contribute(
      'agent.drawer.composer.before',
      'agent.drawer.registration',
      AgentRegistrationContribution,
    ),
    app.ui.contribute(
      'agent.drawer.composer',
      'agent.drawer.composer.default',
      DefaultAgentComposerContribution,
    ),
  ]
  return () => registrations.reverse().forEach((registration) => registration.dispose())
}
