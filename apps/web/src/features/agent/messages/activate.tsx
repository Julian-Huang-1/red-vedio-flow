import { AgentMessageList } from '../../../components/layout/AgentMessageList'
import { AgentMessageItem } from '../../../components/layout/AgentMessageItem'
import type { AgentDrawerController } from '../../../components/layout/AgentDrawer.logic'
import type { FrontendFeatureActivator } from '../../../extension-system/types'

function AgentMessageListContribution({ drawer }: { drawer: AgentDrawerController }) {
  return <AgentMessageList messages={drawer.messages} isActive={drawer.isOpen} />
}

export const activate: FrontendFeatureActivator = (app) => {
  const registrations = [
    app.ui.contribute(
      'agent.drawer.messages',
      'agent.drawer.messages.default',
      AgentMessageListContribution,
    ),
    app.agent.registerMessageRenderer('text', 'agent.message.text', AgentMessageItem),
  ]

  return () => {
    for (const registration of registrations.reverse()) registration.dispose()
  }
}
