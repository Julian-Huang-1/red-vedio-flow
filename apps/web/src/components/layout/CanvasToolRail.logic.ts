import { useWorkflowStore } from '../../store/workflowStore'

export function useCanvasToolRail() {
  const activePanel = useWorkflowStore((state) => state.activeCanvasPanel)
  const closeCanvasPanel = useWorkflowStore((state) => state.closeCanvasPanel)

  return {
    activePanel,
    close: closeCanvasPanel,
  }
}

