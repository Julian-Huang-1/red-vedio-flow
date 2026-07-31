import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  ReactFlow,
  type Node,
  type NodeChange,
  type NodeTypes,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { FileInput, FileText, Image, MousePointer2, Plus, Redo2, Undo2, Video } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useWorkflowStore } from '@/stores/workflowStore'
import { useTaskStore } from '@/stores/taskStore'
import { WorkflowNode } from './WorkflowNode'
import { WorkflowCodeDialog } from './WorkflowCodeDialog'
import { WorkflowSubgraphNode, type WorkflowSubgraphFlowNode } from './WorkflowSubgraphNode'
import type { WorkflowFlowNode, WorkflowNodeData } from './workflowTypes'

const nodeTypes: NodeTypes = {
  workflow: WorkflowNode,
  subgraph: WorkflowSubgraphNode,
}

export function WorkflowCanvas() {
  const nodes = useWorkflowStore((state) => state.nodes)
  const workflowId = useWorkflowStore((state) => state.workflowId)
  const edges = useWorkflowStore((state) => state.edges)
  const subgraphs = useWorkflowStore((state) => state.subgraphs)
  const onNodesChange = useWorkflowStore((state) => state.onNodesChange)
  const onEdgesChange = useWorkflowStore((state) => state.onEdgesChange)
  const connectNodes = useWorkflowStore((state) => state.connectNodes)
  const addNode = useWorkflowStore((state) => state.addNode)
  const canUndo = useWorkflowStore((state) => state.past.length > 0)
  const canRedo = useWorkflowStore((state) => state.future.length > 0)
  const undo = useWorkflowStore((state) => state.undo)
  const redo = useWorkflowStore((state) => state.redo)
  const selectNode = useWorkflowStore((state) => state.selectNode)
  const createSubgraph = useWorkflowStore((state) => state.createSubgraph)
  const moveSubgraph = useWorkflowStore((state) => state.moveSubgraph)
  const updateSubgraphLayout = useWorkflowStore((state) => state.updateSubgraphLayout)
  const renameSubgraph = useWorkflowStore((state) => state.renameSubgraph)
  const dissolveSubgraph = useWorkflowStore((state) => state.dissolveSubgraph)
  const deleteSubgraph = useWorkflowStore((state) => state.deleteSubgraph)
  const registeredNodeTypes = useMemo(() => nodeTypes, [])
  const runSubgraph = useTaskStore((state) => state.runSubgraph)
  const [codeSubgraphId, setCodeSubgraphId] = useState<string>()
  const [selectedSubgraphId, setSelectedSubgraphId] = useState<string>()
  const [selectionMode, setSelectionMode] = useState(false)
  const selectionIdsRef = useRef<string[]>([])
  const renderedNodes = useMemo(() => {
    const cards: WorkflowSubgraphFlowNode[] = subgraphs.flatMap((subgraph) => {
      const members = nodes.filter((node) => subgraph.nodeIds.includes(node.id))
      if (!members.length) return []
      const statuses = members.map((node) => node.data.status)
      const status = statuses.some((item) => item === 'running')
        ? 'running'
        : statuses.some((item) => item === 'error')
          ? 'error'
          : statuses.every((item) => item === 'done') ? 'done' : 'idle'
      return [{
        id: subgraph.id,
        type: 'subgraph' as const,
        position: subgraph.position ?? { x: 0, y: 0 },
        width: subgraph.width ?? 416,
        height: subgraph.height ?? 352,
        style: { width: subgraph.width ?? 416, height: subgraph.height ?? 352 },
        selected: selectedSubgraphId === subgraph.id,
        selectable: true,
        draggable: true,
        dragHandle: '.drag-handle',
        deletable: false,
        zIndex: 0,
        data: {
          name: subgraph.name,
          nodeCount: subgraph.nodeIds.length,
          status,
          onRun: () => void runSubgraph(subgraph.id),
          onViewCode: () => setCodeSubgraphId(subgraph.id),
          onRename: (name: string) => renameSubgraph(subgraph.id, name),
          onDissolve: () => dissolveSubgraph(subgraph.id),
          onDelete: () => {
            if (window.confirm(`删除子图“${subgraph.name}”及其全部节点？`)) deleteSubgraph(subgraph.id, true)
          },
        },
      }]
    })
    return [
      ...cards,
      ...nodes.map((node) => ({
        ...node,
        expandParent: Boolean(node.parentId),
        zIndex: node.parentId ? 1 : 0,
      })),
    ] as Node[]
  }, [deleteSubgraph, dissolveSubgraph, nodes, renameSubgraph, runSubgraph, selectedSubgraphId, subgraphs])

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
        <Button
          variant={selectionMode ? 'default' : 'ghost'}
          size="sm"
          className="h-8 gap-1.5"
          aria-pressed={selectionMode}
          data-workflow-subgraph-selection=""
          onClick={() => {
            selectionIdsRef.current = []
            setSelectionMode((value) => !value)
          }}
        >
          <MousePointer2 size={14} />
          {selectionMode ? '拖拽圈选节点' : '流程圈选'}
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
      <ReactFlow<Node>
        nodes={renderedNodes}
        edges={edges}
        nodeTypes={registeredNodeTypes}
        onNodesChange={(changes) => {
          const nodeChanges = changes.filter((change) => {
            const id = 'id' in change ? change.id : change.item.id
            return !id.startsWith('subgraph-')
          }) as NodeChange<WorkflowFlowNode>[]
          if (nodeChanges.length) onNodesChange(nodeChanges)

          const groupChanges = changes.filter((change) => (
            'id' in change && change.id.startsWith('subgraph-')
          ))
          const groupIds = [...new Set(groupChanges.map((change) => 'id' in change ? change.id : ''))]
          groupIds.forEach((id) => {
            const positionChange = groupChanges.find((change) => change.type === 'position' && change.id === id)
            const dimensionsChange = groupChanges.find((change) => change.type === 'dimensions' && change.id === id)
            const position = positionChange?.type === 'position' ? positionChange.position : undefined
            if (dimensionsChange?.type === 'dimensions') {
              updateSubgraphLayout(id, {
                position,
                width: dimensionsChange.dimensions?.width,
                height: dimensionsChange.dimensions?.height,
              })
            } else if (position) {
              moveSubgraph(id, position)
            }
          })
        }}
        onEdgesChange={onEdgesChange}
        onConnect={connectNodes}
        onNodeClick={(_, node) => {
          if (node.type === 'subgraph') {
            setSelectedSubgraphId(node.id)
            selectNode(undefined)
            return
          }
          setSelectedSubgraphId(undefined)
          selectNode(node.id)
        }}
        onEdgeClick={() => selectNode(undefined)}
        onPaneClick={() => {
          setSelectedSubgraphId(undefined)
          selectNode(undefined)
        }}
        onSelectionChange={({ nodes: selected }) => {
          if (!selectionMode) return
          const ids = selected.filter((node) => node.type === 'workflow').map((node) => node.id)
          selectionIdsRef.current = ids
        }}
        onSelectionEnd={() => {
          if (!selectionMode) return
          // React Flow emits selection changes and selection-end in the same
          // frame. Defer once so the controlled node selection is committed.
          window.setTimeout(() => {
            const selectedIds = useWorkflowStore.getState().nodes
              .filter((node) => node.selected)
              .map((node) => node.id)
            const ids = selectedIds.length ? selectedIds : selectionIdsRef.current
            if (!ids.length) return
            createSubgraph(ids)
            selectionIdsRef.current = []
            setSelectionMode(false)
          }, 0)
        }}
        selectionOnDrag={selectionMode}
        elementsSelectable
        elevateEdgesOnSelect
        deleteKeyCode={['Backspace', 'Delete']}
        panOnDrag={!selectionMode}
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
            if (node.type === 'subgraph') return '#8b7cf6'
            const kind = (node.data as WorkflowNodeData).kind
            if (kind === 'image') return '#8b5cf6'
            if (kind === 'video') return '#f97316'
            return '#3b82f6'
          }}
        />
      </ReactFlow>
      <WorkflowCodeDialog
        open={Boolean(codeSubgraphId)}
        workflowId={workflowId}
        subgraphId={codeSubgraphId}
        title={`${subgraphs.find((item) => item.id === codeSubgraphId)?.name ?? '子图'} JS 代码`}
        onOpenChange={(open) => { if (!open) setCodeSubgraphId(undefined) }}
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
