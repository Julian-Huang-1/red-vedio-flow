import { useViewport } from '@xyflow/react'
import { useWorkflowStore } from '../../store/workflowStore'

export function useCanvasZoomIndicator() {
  const { zoom } = useViewport()
  const openWorkspacePanels = useWorkflowStore((state) => state.openWorkspacePanels)

  return {
    isShifted: openWorkspacePanels.includes('assetManager'),
    zoomPercent: Math.round(zoom * 100),
  }
}

