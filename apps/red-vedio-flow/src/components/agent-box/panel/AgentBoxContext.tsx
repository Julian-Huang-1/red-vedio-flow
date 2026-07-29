import { ChevronDown, ChevronUp, FileText, Image, Workflow, X } from 'lucide-react'
import { AgentBox } from '../AgentBox'
import { useAgentBoxStore } from '../agentBoxStore'
import type { AgentContextItem } from '../agentBoxTypes'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'

function ContextBadge({ item }: { item: AgentContextItem }) {
  const removeContext = useAgentBoxStore((state) => state.removeContext)

  return (
    <Badge variant="outline" className="gap-1.5 py-1 pl-2.5 pr-1">
      {item.kind === 'node'
        ? <FileText size={14} className="text-blue-500" />
        : <Image size={14} className="text-violet-500" />}
      {item.title}
      <Button
        variant="ghost"
        size="icon"
        className="size-6 rounded-sm"
        aria-label={`移除${item.title}`}
        onClick={() => removeContext(item.id)}
      >
        <X size={12} />
      </Button>
    </Badge>
  )
}

export function AgentBoxContext() {
  const contextIds = useAgentBoxStore((state) => state.contextIds)
  const contextsById = useAgentBoxStore((state) => state.contextsById)
  const expanded = useAgentBoxStore((state) => state.contextExpanded)
  const clearContext = useAgentBoxStore((state) => state.clearContext)
  const addContext = useAgentBoxStore((state) => state.addContext)
  const setExpanded = useAgentBoxStore((state) => state.setContextExpanded)

  return (
    <AgentBox.Context data-expanded={expanded ? '' : undefined}>
      <div className={expanded ? 'mb-3 flex items-center justify-between' : 'flex items-center justify-between'}>
        <button
          type="button"
          className="flex items-center gap-2 text-xs font-medium"
          onClick={() => setExpanded(!expanded)}
        >
          <Workflow size={14} />
          当前上下文
          <span className="text-muted-foreground">{contextIds.length}</span>
          {expanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
        </button>
        {contextIds.length ? (
          <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={clearContext}>
            清除
          </Button>
        ) : null}
      </div>
      {expanded ? (
        contextIds.length ? (
          <div className="flex flex-wrap gap-2">
            {contextIds.map((id) => {
              const item = contextsById[id]
              return item ? <ContextBadge key={id} item={item} /> : null
            })}
          </div>
        ) : (
          <button
            type="button"
            className="w-full rounded-lg border border-dashed px-3 py-3 text-xs text-muted-foreground hover:bg-muted/50 hover:text-foreground"
            onClick={() => addContext({
              id: 'node-storyboard',
              kind: 'node',
              title: '分镜脚本',
            })}
          >
            添加当前节点作为上下文
          </button>
        )
      ) : null}
    </AgentBox.Context>
  )
}
