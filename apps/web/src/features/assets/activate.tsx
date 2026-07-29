import { AssetManager } from '../../components/layout/AssetManager'
import type { FrontendFeatureActivator } from '../../extension-system/types'

export const activate: FrontendFeatureActivator = (app) =>
  app.ui.contribute('canvas.overlay', 'assets.manager', AssetManager, { order: 20 })
