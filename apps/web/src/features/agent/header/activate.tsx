import { AgentDrawerHeader } from '../../../components/layout/AgentDrawerHeader'
import type { AgentDrawerController } from '../../../components/layout/AgentDrawer.logic'
import type { FrontendFeatureActivator } from '../../../extension-system/types'

function AgentDrawerHeaderContribution({ drawer }: { drawer: AgentDrawerController }) {
  return <AgentDrawerHeader onClose={drawer.close} />
}

export const activate: FrontendFeatureActivator = (app) =>
  app.ui.contribute(
    'agent.drawer.header',
    'agent.drawer.header.default',
    AgentDrawerHeaderContribution,
  )
