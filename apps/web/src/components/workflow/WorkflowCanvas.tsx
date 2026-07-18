import {
  Background,
  BackgroundVariant,
  ReactFlow,
  ViewportPortal,
  type NodeMouseHandler,
  useReactFlow,
} from '@xyflow/react'
import { useCallback, useMemo } from 'react'
import { useWorkflowStore } from '../../store/workflowStore'
import { AddNodeMenu } from './menus/AddNodeMenu'
import { MaterialNode } from './nodes/MaterialNode'
import { NodePromptComposer } from './prompt/NodePromptComposer'

const nodeTypes = {
  material: MaterialNode,
}

export function WorkflowCanvas() {
  const { screenToFlowPosition } = useReactFlow()
  const nodes = useWorkflowStore((state) => state.nodes)
  const edges = useWorkflowStore((state) => state.edges)
  const selectedNodeId = useWorkflowStore((state) => state.selectedNodeId)
  const editingNodeId = useWorkflowStore((state) => state.editingNodeId)
  const composerNodeId = useWorkflowStore((state) => state.composerNodeId)
  const onNodesChange = useWorkflowStore((state) => state.onNodesChange)
  const onEdgesChange = useWorkflowStore((state) => state.onEdgesChange)
  const connectNodes = useWorkflowStore((state) => state.connectNodes)
  const openAddNodeMenu = useWorkflowStore((state) => state.openAddNodeMenu)
  const selectNode = useWorkflowStore((state) => state.selectNode)
  const beginEditNode = useWorkflowStore((state) => state.beginEditNode)

  const composerNode = useMemo(
    () => nodes.find((node) => node.id === composerNodeId),
    [nodes, composerNodeId],
  )

  const shouldShowComposer = composerNode && editingNodeId !== composerNode.id

  const handlePaneDoubleClick = useCallback(
    (event: React.MouseEvent) => {
      const flowPosition = screenToFlowPosition({ x: event.clientX, y: event.clientY })
      openAddNodeMenu({ x: event.clientX, y: event.clientY }, flowPosition)
    },
    [openAddNodeMenu, screenToFlowPosition],
  )

  const handleCanvasDoubleClick = useCallback(
    (event: React.MouseEvent<HTMLElement>) => {
      const target = event.target as HTMLElement
      const interactiveTarget = target.closest(
        '.react-flow__node, .react-flow__handle, button, input, textarea, video',
      )

      if (interactiveTarget) return
      handlePaneDoubleClick(event)
    },
    [handlePaneDoubleClick],
  )

  const handleNodeClick: NodeMouseHandler = useCallback(
    (event, node) => {
      if (event.detail > 1) return
      selectNode(node.id)
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

  return (
    <section className="absolute inset-0" onDoubleClick={handleCanvasDoubleClick}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={connectNodes}
        onPaneClick={(event) => {
          const target = event.target as HTMLElement
          if (target.closest('[data-node-composer="true"]')) return
          selectNode(undefined)
        }}
        onNodeClick={handleNodeClick}
        onNodeDoubleClick={handleNodeDoubleClick}
        fitView
        zoomOnDoubleClick={false}
        minZoom={0.15}
        maxZoom={1.6}
        defaultViewport={{ x: 0, y: 0, zoom: 0.88 }}
        proOptions={{ hideAttribution: true }}
      >
        <Background variant={BackgroundVariant.Dots} gap={22} size={1.4} color="#2d2d2d" />
      </ReactFlow>
      {nodes.length === 0 ? (
        <div className="pointer-events-none absolute left-1/2 top-[32%] z-10 -translate-x-1/2 text-sm text-zinc-500">
          双击画布生成节点
        </div>
      ) : null}
      <AddNodeMenu />
      <ViewportPortal>{shouldShowComposer ? <NodePromptComposer node={composerNode} /> : null}</ViewportPortal>
    </section>
  )
}
