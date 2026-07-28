import { useMemo } from 'react'
import { useWorkflowStore } from '../../../store/workflowStore'

export function useAddNodeMenu() {
  const menu = useWorkflowStore((state) => state.addNodeMenu)
  const createNode = useWorkflowStore((state) => state.createNode)
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
    position,
  }
}

