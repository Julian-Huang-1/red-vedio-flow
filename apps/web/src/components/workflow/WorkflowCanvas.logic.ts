import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type MouseEvent,
  type WheelEvent,
} from 'react'
import { useReactFlow, type NodeMouseHandler } from '@xyflow/react'
import { useWorkflowStore } from '../../store/workflowStore'

const interactiveSelector =
  '.react-flow__node, .react-flow__handle, button, input, textarea, video, [data-node-composer="true"]'

export function useWorkflowCanvas() {
  const { screenToFlowPosition } = useReactFlow()
  const [isTrackpadPanning, setIsTrackpadPanning] = useState(false)
  const trackpadIdleTimerRef = useRef<number>()
  const nodes = useWorkflowStore((state) => state.nodes)
  const edges = useWorkflowStore((state) => state.edges)
  const composerNodeId = useWorkflowStore((state) => state.composerNodeId)
  const onNodesChange = useWorkflowStore((state) => state.onNodesChange)
  const onEdgesChange = useWorkflowStore((state) => state.onEdgesChange)
  const connectNodes = useWorkflowStore((state) => state.connectNodes)
  const openAddNodeMenu = useWorkflowStore((state) => state.openAddNodeMenu)
  const selectNode = useWorkflowStore((state) => state.selectNode)
  const beginEditNode = useWorkflowStore((state) => state.beginEditNode)
  const closeCanvasPanel = useWorkflowStore((state) => state.closeCanvasPanel)
  const closeWorkspacePanel = useWorkflowStore((state) => state.closeWorkspacePanel)

  const openMenuAtPointer = useCallback(
    (event: MouseEvent<HTMLElement>) => {
      event.preventDefault()
      const flowPosition = screenToFlowPosition({ x: event.clientX, y: event.clientY })
      openAddNodeMenu({ x: event.clientX, y: event.clientY }, flowPosition)
    },
    [openAddNodeMenu, screenToFlowPosition],
  )

  const handleCanvasContextMenu = useCallback(
    (event: MouseEvent<HTMLElement>) => {
      if ((event.target as HTMLElement).closest(interactiveSelector)) return
      openMenuAtPointer(event)
    },
    [openMenuAtPointer],
  )

  const handleCanvasDoubleClick = useCallback(
    (event: MouseEvent<HTMLElement>) => {
      if ((event.target as HTMLElement).closest(interactiveSelector)) return
      const flowPosition = screenToFlowPosition({ x: event.clientX, y: event.clientY })
      openAddNodeMenu({ x: event.clientX, y: event.clientY }, flowPosition)
    },
    [openAddNodeMenu, screenToFlowPosition],
  )

  const handlePaneClick = useCallback(
    (event: MouseEvent) => {
      if ((event.target as HTMLElement).closest('[data-node-composer="true"]')) return
      closeCanvasPanel()
      closeWorkspacePanel()
      if (!composerNodeId) selectNode(undefined)
    },
    [closeCanvasPanel, closeWorkspacePanel, composerNodeId, selectNode],
  )

  const handleNodeClick: NodeMouseHandler = useCallback(
    (event, node) => {
      if (event.detail <= 1) selectNode(node.id)
    },
    [selectNode],
  )

  const handleNodeDoubleClick: NodeMouseHandler = useCallback(
    (event, node) => {
      if (node.data.materialType !== 'text') return
      event.stopPropagation()
      window.setTimeout(() => {
        beginEditNode(node.id)
        window.dispatchEvent(new CustomEvent('focus-node-composer', { detail: { nodeId: node.id } }))
      }, 0)
    },
    [beginEditNode],
  )

  const handleWheel = useCallback((event: WheelEvent<HTMLElement>) => {
    if ((event.target as HTMLElement).closest('.react-flow__node')) return
    setIsTrackpadPanning(true)
    if (trackpadIdleTimerRef.current) window.clearTimeout(trackpadIdleTimerRef.current)
    trackpadIdleTimerRef.current = window.setTimeout(() => setIsTrackpadPanning(false), 600)
  }, [])

  useEffect(() => {
    return () => {
      if (trackpadIdleTimerRef.current) window.clearTimeout(trackpadIdleTimerRef.current)
    }
  }, [])

  return {
    connectNodes,
    edges,
    handleCanvasContextMenu,
    handleCanvasDoubleClick,
    handleNodeClick,
    handleNodeDoubleClick,
    handlePaneClick,
    handleWheel,
    isTrackpadPanning,
    nodes,
    onEdgesChange,
    onNodesChange,
  }
}
