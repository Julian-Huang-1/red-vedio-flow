import { useReactFlow } from '@xyflow/react'
import { useWorkflowStore } from '../../store/workflowStore'

export function useBottomToolbar() {
  const { screenToFlowPosition } = useReactFlow()
  const activePanel = useWorkflowStore((state) => state.activeCanvasPanel)
  const openAddNodeMenu = useWorkflowStore((state) => state.openAddNodeMenu)
  const toggleCanvasPanel = useWorkflowStore((state) => state.toggleCanvasPanel)

  const addNode = () => {
    const screen = { x: window.innerWidth / 2, y: Math.max(120, window.innerHeight / 2 - 140) }
    openAddNodeMenu(screen, screenToFlowPosition(screen))
  }

  return {
    activePanel,
    addNode,
    toggleCanvasPanel,
  }
}

