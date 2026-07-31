import { useState } from 'react'
import type { Node, NodeProps } from '@xyflow/react'
import { Code2, GitBranch, LoaderCircle, MoreHorizontal, Play, Trash2, Ungroup } from 'lucide-react'
import { Button } from '@/components/ui/button'

export type WorkflowSubgraphNodeData = {
  [key: string]: unknown
  name: string
  nodeCount: number
  status: 'idle' | 'running' | 'error' | 'done'
  onRun: () => void
  onViewCode: () => void
  onRename: (name: string) => void
  onDissolve: () => void
  onDelete: () => void
}

export type WorkflowSubgraphFlowNode = Node<WorkflowSubgraphNodeData, 'subgraph'>

export function WorkflowSubgraphNode({ data, selected }: NodeProps<WorkflowSubgraphFlowNode>) {
  const [name, setName] = useState(data.name)
  const [editingName, setEditingName] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const running = data.status === 'running'
  return (
    <section
      className="h-full w-full rounded-2xl border border-violet-200/90 bg-violet-50/60 transition-[border-color,box-shadow] duration-150 hover:border-violet-300 data-[selected]:border-violet-500 data-[selected]:shadow-[0_0_0_3px_rgba(139,92,246,0.10)] data-[error]:border-red-300"
      data-workflow-subgraph=""
      data-selected={selected ? '' : undefined}
      data-running={running ? '' : undefined}
      data-error={data.status === 'error' ? '' : undefined}
    >
      <header
        className="drag-handle flex h-[52px] cursor-grab select-none items-center gap-2 px-4 active:cursor-grabbing"
        data-workflow-subgraph-header=""
        title="拖动整个 Subflow"
      >
        <GitBranch className="size-4 shrink-0 text-violet-600" />
        <span className="size-1.5 shrink-0 rounded-full bg-violet-500 data-[running]:animate-pulse" data-running={running ? '' : undefined} />
        {editingName ? (
          <input
            className="nodrag min-w-0 max-w-52 bg-transparent text-sm font-semibold text-foreground outline-none"
            value={name}
            aria-label="Subflow 名称"
            autoFocus
            onChange={(event) => setName(event.target.value)}
            onBlur={() => {
              data.onRename(name)
              setEditingName(false)
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter') event.currentTarget.blur()
              if (event.key === 'Escape') {
                setName(data.name)
                setEditingName(false)
              }
            }}
          />
        ) : (
          <span
            className="min-w-0 max-w-52 truncate text-sm font-semibold text-foreground"
            data-workflow-subgraph-title=""
            title="双击重命名"
            onDoubleClick={() => setEditingName(true)}
          >
            {data.name}
          </span>
        )}
        <span className="rounded-full border border-violet-200 bg-white/75 px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
          {data.nodeCount} 个节点
        </span>
        <div className="flex-1" />
        <Button className="nodrag h-8 gap-1.5 rounded-lg bg-neutral-900 px-3 text-white hover:bg-neutral-800" size="sm" disabled={running} onClick={data.onRun}>
          {running ? <LoaderCircle className="size-3.5 animate-spin" /> : <Play className="size-3.5" fill="currentColor" />}
          {running ? '运行中' : '运行'}
        </Button>
        <Button className="nodrag size-8 rounded-lg border bg-white/80" size="icon" variant="ghost" title="查看 JS 代码" onClick={data.onViewCode}>
          <Code2 className="size-4" />
        </Button>
        <div className="nodrag relative">
          <Button
            className="size-8 rounded-lg border bg-white/80"
            size="icon"
            variant="ghost"
            title="更多操作"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((value) => !value)}
          >
            <MoreHorizontal className="size-4" />
          </Button>
          {menuOpen && (
            <div className="absolute right-0 top-10 z-20 w-48 rounded-lg border bg-popover p-1 text-popover-foreground shadow-md" data-workflow-subgraph-menu="">
              <button
                type="button"
                className="flex w-full items-center rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent"
                onClick={() => { setMenuOpen(false); data.onDissolve() }}
              >
                <Ungroup className="mr-2 size-4" />解除 Subflow
              </button>
              <div className="my-1 h-px bg-border" />
              <button
                type="button"
                className="flex w-full items-center rounded-md px-2 py-1.5 text-left text-sm text-destructive hover:bg-accent"
                onClick={() => { setMenuOpen(false); data.onDelete() }}
              >
                <Trash2 className="mr-2 size-4" />删除 Subflow 及节点
              </button>
            </div>
          )}
        </div>
      </header>
    </section>
  )
}
