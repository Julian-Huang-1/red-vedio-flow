import { Background, BackgroundVariant, ReactFlow } from '@xyflow/react'
import { useWorkflowCanvas } from './WorkflowCanvas.logic'
import { WorkflowCanvasPrimitive as Canvas } from './WorkflowCanvas.primitives'
import { AddNodeMenu } from './menus/AddNodeMenu'

export function WorkflowCanvas() {
  const canvas = useWorkflowCanvas()

  return (
    <Canvas.Root
      empty={canvas.nodes.length === 0}
      panning={canvas.isTrackpadPanning}
      onContextMenu={canvas.handleCanvasContextMenu}
      onDoubleClick={canvas.handleCanvasDoubleClick}
      onWheelCapture={canvas.handleWheel}
    >
      <ReactFlow
        nodes={canvas.nodes}
        edges={canvas.edges}
        nodeTypes={canvas.nodeTypes}
        onNodesChange={canvas.onNodesChange}
        onEdgesChange={canvas.onEdgesChange}
        onConnect={canvas.connectNodes}
        onPaneClick={canvas.handlePaneClick}
        onNodeClick={canvas.handleNodeClick}
        onNodeDoubleClick={canvas.handleNodeDoubleClick}
        zoomOnDoubleClick={false}
        zoomOnScroll={false}
        zoomOnPinch
        panOnDrag={false}
        panOnScroll
        panOnScrollSpeed={0.8}
        minZoom={0.15}
        maxZoom={1.6}
        defaultViewport={{ x: 0, y: 0, zoom: 0.7 }}
        proOptions={{ hideAttribution: true }}
      >
        <Background variant={BackgroundVariant.Dots} gap={22} size={1.4} color="#2d2d2d" />
      </ReactFlow>
      {canvas.nodes.length === 0 ? <Canvas.Empty>右击画布生成节点</Canvas.Empty> : null}
      <AddNodeMenu />
    </Canvas.Root>
  )
}
