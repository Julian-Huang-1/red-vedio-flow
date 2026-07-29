import { useViewport } from '@xyflow/react'
import { useCanvasUiStore } from '../../state/canvasUiStore'

export function useCanvasZoomIndicator() {
  const { zoom } = useViewport()
  const openWorkspacePanels = useCanvasUiStore((state) => state.openWorkspacePanels)

  return {
    isShifted: openWorkspacePanels.includes('assetManager'),
    zoomPercent: Math.round(zoom * 100),
  }
}
