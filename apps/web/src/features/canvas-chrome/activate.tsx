import { BottomToolbar } from '../../components/layout/BottomToolbar'
import { CanvasToolRail } from '../../components/layout/CanvasToolRail'
import { CanvasZoomIndicator } from '../../components/layout/CanvasZoomIndicator'
import { TopBar } from '../../components/layout/TopBar'
import type { FrontendFeatureActivator } from '../../extension-system/types'

export const activate: FrontendFeatureActivator = (app) => {
  const registrations = [
    app.ui.contribute('canvas.overlay', 'canvas.tool-rail', CanvasToolRail, { order: 10 }),
    app.ui.contribute('canvas.overlay', 'canvas.zoom-indicator', CanvasZoomIndicator, { order: 30 }),
    app.ui.contribute('canvas.overlay', 'canvas.top-bar', TopBar, { order: 50 }),
    app.ui.contribute('canvas.overlay', 'canvas.bottom-toolbar', BottomToolbar, { order: 60 }),
  ]

  return () => {
    for (const registration of registrations.reverse()) registration.dispose()
  }
}
