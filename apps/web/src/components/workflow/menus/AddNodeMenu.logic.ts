import { useMemo } from 'react'
import { useNodeTypeContributions } from '../../../extension-system/nodeExtensions.logic'
import { useCanvasUiStore } from '../../../state/canvasUiStore'
import { useWorkflowStore } from '../../../store/workflowStore'

export function useAddNodeMenu() {
  const menu = useCanvasUiStore((state) => state.addNodeMenu)
  const createNode = useWorkflowStore((state) => state.createNode)
  const nodeTypes = useNodeTypeContributions()
  const position = useMemo(
    () => ({
      left: Math.min(menu.screenX, window.innerWidth - 280),
      top: Math.min(menu.screenY, window.innerHeight - 520),
    }),
    [menu.screenX, menu.screenY],
  )

  return {
    createNode,
    isOpen: menu.open,
    nodeTypes,
    position,
  }
}
