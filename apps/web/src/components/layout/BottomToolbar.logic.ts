import { useReactFlow } from '@xyflow/react'
import { useCanvasPanelContributions } from '../../extension-system/canvasExtensions.logic'
import { useCanvasUiStore } from '../../state/canvasUiStore'

export function useBottomToolbar() {
  const { screenToFlowPosition } = useReactFlow()
  const panels = useCanvasPanelContributions()
  const activePanel = useCanvasUiStore((state) => state.activeCanvasPanel)
  const openAddNodeMenu = useCanvasUiStore((state) => state.openAddNodeMenu)
  const toggleCanvasPanel = useCanvasUiStore((state) => state.toggleCanvasPanel)

  const addNode = () => {
    const screen = { x: window.innerWidth / 2, y: Math.max(120, window.innerHeight / 2 - 140) }
    openAddNodeMenu(screen, screenToFlowPosition(screen))
  }

  return {
    activePanel,
    addNode,
    panels,
    toggleCanvasPanel,
  }
}
