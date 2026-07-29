import { useEffect, useMemo, useState } from 'react'
import { useReactFlow } from '@xyflow/react'
import type { MaterialType } from '@red-video-flow/workflow-core'
import {
  getNodeTypeContribution,
  useNodeTypeContributions,
} from '../../extension-system/nodeExtensions.logic'
import { useCanvasUiStore } from '../../state/canvasUiStore'
import { useWorkflowStore } from '../../store/workflowStore'
import { useAnimatedPresence } from '../../ui/useAnimatedPresence'
import { fetchAssets, type UploadedAsset } from '@red-video-flow/workflow-client'

export type AssetManagerTab = 'canvas' | 'assets'
export type AssetManagerFilter = 'all' | MaterialType

export function useAssetManager() {
  const { setCenter } = useReactFlow()
  const nodeTypes = useNodeTypeContributions()
  const nodes = useWorkflowStore((state) => state.nodes)
  const workflowTitle = useWorkflowStore((state) => state.workflowTitle)
  const workflowId = useWorkflowStore((state) => state.workflowId)
  const openWorkspacePanels = useCanvasUiStore((state) => state.openWorkspacePanels)
  const toggleWorkspacePanel = useCanvasUiStore((state) => state.toggleWorkspacePanel)
  const closeWorkspacePanel = useCanvasUiStore((state) => state.closeWorkspacePanel)
  const selectNode = useWorkflowStore((state) => state.selectNode)
  const [tab, setTab] = useState<AssetManagerTab>('canvas')
  const [filter, setFilter] = useState<AssetManagerFilter>('all')
  const [query, setQuery] = useState('')
  const [assets, setAssets] = useState<UploadedAsset[]>([])
  const [assetError, setAssetError] = useState<string>()
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

  useEffect(() => {
    if (!isOpen || tab !== 'assets') return
    setAssetError(undefined)
    void fetchAssets(workflowId)
      .then((result) => setAssets(result.assets))
      .catch((error) => setAssetError(error instanceof Error ? error.message : String(error)))
  }, [isOpen, tab, workflowId])

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
    assets,
    assetError,
    filteredNodes,
    isMounted: presence.isMounted,
    isOpen,
    nodes,
    nodeTypes,
    presenceState: presence.state,
    query,
    tab,
    workflowTitle,
    close: () => closeWorkspacePanel('assetManager'),
    getNodeType: getNodeTypeContribution,
    locateNode,
    setFilter,
    setQuery,
    setTab,
    toggle: () => toggleWorkspacePanel('assetManager'),
  }
}
