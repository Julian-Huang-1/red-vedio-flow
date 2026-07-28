import { useMemo, useState } from 'react'
import { useReactFlow } from '@xyflow/react'
import type { MaterialType } from '@red-video-flow/workflow-core'
import { useWorkflowStore } from '../../store/workflowStore'
import { useAnimatedPresence } from '../../ui/useAnimatedPresence'

export type AssetManagerTab = 'canvas' | 'assets'
export type AssetManagerFilter = 'all' | MaterialType

export function useAssetManager() {
  const { setCenter } = useReactFlow()
  const nodes = useWorkflowStore((state) => state.nodes)
  const workflowTitle = useWorkflowStore((state) => state.workflowTitle)
  const openWorkspacePanels = useWorkflowStore((state) => state.openWorkspacePanels)
  const toggleWorkspacePanel = useWorkflowStore((state) => state.toggleWorkspacePanel)
  const closeWorkspacePanel = useWorkflowStore((state) => state.closeWorkspacePanel)
  const selectNode = useWorkflowStore((state) => state.selectNode)
  const [tab, setTab] = useState<AssetManagerTab>('canvas')
  const [filter, setFilter] = useState<AssetManagerFilter>('all')
  const [query, setQuery] = useState('')
  const isOpen = openWorkspacePanels.includes('assetManager')
  const presence = useAnimatedPresence(isOpen)

  const filteredNodes = useMemo(() => {
    const keyword = query.trim().toLowerCase()
    return nodes.filter((node) => {
      const typeMatched = filter === 'all' || node.data.materialType === filter
      const queryMatched = !keyword || node.data.title.toLowerCase().includes(keyword)
      return typeMatched && queryMatched
    })
  }, [filter, nodes, query])

  const locateNode = (nodeId: string) => {
    const node = nodes.find((item) => item.id === nodeId)
    if (!node) return
    selectNode(node.id)
    setCenter(node.position.x + (node.width ?? 360) / 2, node.position.y + (node.height ?? 220) / 2, {
      zoom: 0.92,
      duration: 360,
    })
  }

  return {
    filter,
    filteredNodes,
    isMounted: presence.isMounted,
    isOpen,
    nodes,
    presenceState: presence.state,
    query,
    tab,
    workflowTitle,
    close: () => closeWorkspacePanel('assetManager'),
    locateNode,
    setFilter,
    setQuery,
    setTab,
    toggle: () => toggleWorkspacePanel('assetManager'),
  }
}

