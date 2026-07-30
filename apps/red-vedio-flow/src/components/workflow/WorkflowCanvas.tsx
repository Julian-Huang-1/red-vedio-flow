import { useEffect, useMemo, useState } from 'react'
import {
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  ReactFlow,
  type NodeTypes,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { Code2, FileInput, FileText, Image, LoaderCircle, Play, Plus, Redo2, Square, Undo2, Video } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useWorkflowStore } from '@/stores/workflowStore'
import { useTaskStore } from '@/stores/taskStore'
import { WorkflowNode } from './WorkflowNode'
import { WorkflowCodeDialog } from './WorkflowCodeDialog'
import type { WorkflowNodeData } from './workflowTypes'

const nodeTypes: NodeTypes = {
  workflow: WorkflowNode,
}

export function WorkflowCanvas() {
  const nodes = useWorkflowStore((state) => state.nodes)
  const workflowId = useWorkflowStore((state) => state.workflowId)
  const edges = useWorkflowStore((state) => state.edges)
  const onNodesChange = useWorkflowStore((state) => state.onNodesChange)
  const onEdgesChange = useWorkflowStore((state) => state.onEdgesChange)
  const connectNodes = useWorkflowStore((state) => state.connectNodes)
  const addNode = useWorkflowStore((state) => state.addNode)
  const canUndo = useWorkflowStore((state) => state.past.length > 0)
  const canRedo = useWorkflowStore((state) => state.future.length > 0)
  const undo = useWorkflowStore((state) => state.undo)
  const redo = useWorkflowStore((state) => state.redo)
  const selectNode = useWorkflowStore((state) => state.selectNode)
  const registeredNodeTypes = useMemo(() => nodeTypes, [])
  const [codeDialogOpen, setCodeDialogOpen] = useState(false)
  const workflowRun = useTaskStore((state) => state.workflowRun)
  const runWorkflow = useTaskStore((state) => state.runWorkflow)
  const cancelWorkflow = useTaskStore((state) => state.cancelWorkflow)
  const isWorkflowRunning = workflowRun?.status === 'queued' || workflowRun?.status === 'running'

  useEffect(() => {
    const handleHistoryShortcut = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      if (target?.matches('input, textarea, [contenteditable="true"]')) return
      const modifier = event.metaKey || event.ctrlKey
      const redoShortcut = modifier
        && ((event.shiftKey && event.key.toLowerCase() === 'z')
          || (!event.metaKey && event.key.toLowerCase() === 'y'))
      const undoShortcut = modifier && !event.shiftKey && event.key.toLowerCase() === 'z'
      if (!undoShortcut && !redoShortcut) return
      event.preventDefault()
      const store = useWorkflowStore.getState()
      if (redoShortcut) store.redo()
      else store.undo()
    }
    window.addEventListener('keydown', handleHistoryShortcut)
    return () => window.removeEventListener('keydown', handleHistoryShortcut)
  }, [])
  
  return (
    <div className="relative h-full w-full" data-workflow-canvas="">
      <div className="absolute left-4 top-4 z-10 flex items-center gap-2 rounded-xl border bg-background/90 p-1.5 shadow-sm backdrop-blur">
        <NodeButton label="文本" icon={FileText} onClick={() => addNode('text')} />
        <NodeButton label="图片" icon={Image} onClick={() => addNode('image')} />
        <NodeButton label="视频" icon={Video} onClick={() => addNode('video')} />
        <NodeButton label="输入" icon={FileInput} onClick={() => addNode('text', 'input')} />
        <div className="mx-0.5 h-5 w-px bg-border" />
        <Button
          variant={isWorkflowRunning ? 'secondary' : 'default'}
          size="sm"
          className="h-8 gap-1.5"
          aria-label={isWorkflowRunning ? '停止工作流' : '运行工作流'}
          data-workflow-run=""
          onClick={() => {
            if (isWorkflowRunning) void cancelWorkflow()
            else void runWorkflow()
          }}
        >
          {workflowRun?.status === 'queued'
            ? <LoaderCircle size={13} className="animate-spin" />
            : isWorkflowRunning
              ? <Square size={11} fill="currentColor" />
              : <Play size={13} fill="currentColor" />}
          {isWorkflowRunning ? '停止' : '运行工作流'}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="h-8 gap-1.5"
          aria-label="查看工作流代码"
          data-workflow-view-code=""
          onClick={() => setCodeDialogOpen(true)}
        >
          <Code2 size={14} />
          查看代码
        </Button>
        <div className="mx-0.5 h-5 w-px bg-border" />
        <Button
          variant="ghost"
          size="icon"
          className="size-8"
          disabled={!canUndo}
          aria-label="撤回"
          title="撤回（⌘/Ctrl + Z）"
          data-workflow-undo=""
          onClick={undo}
        >
          <Undo2 size={14} />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="size-8"
          disabled={!canRedo}
          aria-label="重做"
          title="重做（⌘/Ctrl + Shift + Z）"
          data-workflow-redo=""
          onClick={redo}
        >
          <Redo2 size={14} />
        </Button>
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
        elementsSelectable
        elevateEdgesOnSelect
        deleteKeyCode={['Backspace', 'Delete']}
        panOnDrag={false}
        panOnScroll
        zoomOnScroll={false}
        proOptions={{ hideAttribution: true }}
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
      <WorkflowCodeDialog
        open={codeDialogOpen}
        workflowId={workflowId}
        onOpenChange={setCodeDialogOpen}
      />
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
