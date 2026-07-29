import { AgentDrawer } from '../../../components/layout/AgentDrawer'
import type { FrontendFeatureActivator } from '../../../extension-system/types'

export const activate: FrontendFeatureActivator = (app) =>
  app.ui.contribute('canvas.overlay', 'agent.drawer', AgentDrawer, { order: 40 })
