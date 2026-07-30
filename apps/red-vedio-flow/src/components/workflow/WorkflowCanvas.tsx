import { useMemo } from 'react'
import {
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  ReactFlow,
  type NodeTypes,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { FileText, Image, Plus, Video } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useWorkflowStore } from '@/stores/workflowStore'
import { WorkflowNode } from './WorkflowNode'
import type { WorkflowNodeData } from './workflowTypes'

const nodeTypes: NodeTypes = {
  workflow: WorkflowNode,
}

export function WorkflowCanvas() {
  const nodes = useWorkflowStore((state) => state.nodes)
  const edges = useWorkflowStore((state) => state.edges)
  const onNodesChange = useWorkflowStore((state) => state.onNodesChange)
  const onEdgesChange = useWorkflowStore((state) => state.onEdgesChange)
  const connectNodes = useWorkflowStore((state) => state.connectNodes)
  const addNode = useWorkflowStore((state) => state.addNode)
  const selectNode = useWorkflowStore((state) => state.selectNode)
  const registeredNodeTypes = useMemo(() => nodeTypes, [])
  
  return (
    <div className="relative h-full w-full" data-workflow-canvas="">
      <div className="absolute left-4 top-4 z-10 flex items-center gap-2 rounded-xl border bg-background/90 p-1.5 shadow-sm backdrop-blur">
        <NodeButton label="文本" icon={FileText} onClick={() => addNode('text')} />
        <NodeButton label="图片" icon={Image} onClick={() => addNode('image')} />
        <NodeButton label="视频" icon={Video} onClick={() => addNode('video')} />
      </div>

      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={registeredNodeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={connectNodes}
        onNodeClick={(_, node) => selectNode(node.id)}
        onEdgeClick={() => selectNode(undefined)}
        onPaneClick={() => selectNode(undefined)}
        edgesSelectable
        elementsSelectable
        elevateEdgesOnSelect
        deleteKeyCode={['Backspace', 'Delete']}
        panOnDrag={false}
        panOnScroll
        zoomOnScroll={false}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        defaultEdgeOptions={{
          animated: true,
          interactionWidth: 24,
          style: { strokeWidth: 1.5 },
        }}
      >
        <Background variant={BackgroundVariant.Dots} gap={18} size={1.2} />
        <Controls />
        <MiniMap
          pannable
          zoomable
          nodeColor={(node) => {
            const kind = (node.data as WorkflowNodeData).kind
            if (kind === 'image') return '#8b5cf6'
            if (kind === 'video') return '#f97316'
            return '#3b82f6'
          }}
        />
      </ReactFlow>
    </div>
  )
}

function NodeButton({
  label,
  icon: Icon,
  onClick,
}: {
  label: string
  icon: typeof Plus
  onClick: () => void
}) {
  return (
    <Button variant="ghost" size="sm" className="h-8 gap-1.5" onClick={onClick}>
      <Plus size={13} />
      <Icon size={14} />
      {label}
    </Button>
  )
}
