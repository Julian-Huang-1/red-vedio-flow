import { Pencil, Search, Trash2, X } from 'lucide-react'
import { useAgentBoxStore } from '../agentBoxStore'
import {
  useDeletePiAgentSessionMutation,
  usePiAgentSessionsQuery,
  useRenamePiAgentSessionMutation,
} from '../piAgentQueries'
import { Button } from '@/components/ui/button'

export function AgentBoxHistory() {
  const open = useAgentBoxStore((state) => state.historyOpen)
  const query = useAgentBoxStore((state) => state.historyQuery)
  const sessionIds = useAgentBoxStore((state) => state.sessionIds)
  const sessionsById = useAgentBoxStore((state) => state.sessionsById)
  const activeSessionId = useAgentBoxStore((state) => state.activeSessionId)
  const setQuery = useAgentBoxStore((state) => state.setHistoryQuery)
  const selectSession = useAgentBoxStore((state) => state.selectSession)
  const renameSession = useAgentBoxStore((state) => state.renameSession)
  const deleteSession = useAgentBoxStore((state) => state.deleteSession)
  const toggleHistory = useAgentBoxStore((state) => state.toggleHistory)
  const renameSessionMutation = useRenamePiAgentSessionMutation()
  const deleteSessionMutation = useDeletePiAgentSessionMutation()
  const searchQuery = usePiAgentSessionsQuery(query)
  const searchedSessionsById = Object.fromEntries(
    (query.trim() ? searchQuery.data ?? [] : []).map((session) => [session.id, session]),
  )
  const filteredIds = query.trim()
    ? (searchQuery.data ?? []).map((session) => session.id)
    : sessionIds

  if (!open) return null

  return (
    <section className="absolute inset-x-0 bottom-0 top-16 z-20 flex flex-col bg-background" data-agent-box-history="">
      <div className="flex items-center gap-2 border-b p-4">
        <label className="flex h-9 min-w-0 flex-1 items-center gap-2 rounded-md border bg-background px-3">
          <Search size={14} className="text-muted-foreground" />
          <input
            className="min-w-0 flex-1 bg-transparent text-sm outline-none"
            value={query}
            placeholder="搜索会话"
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
        <Button variant="ghost" size="icon" aria-label="关闭历史" onClick={toggleHistory}>
          <X size={17} />
        </Button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {filteredIds.map((id) => {
          const session = sessionsById[id] ?? searchedSessionsById[id]
          if (!session) return null
          const messageCount = sessionsById[id]?.messageIds.length
            ?? searchedSessionsById[id]?.messageCount
            ?? 0
          return (
            <div
              key={id}
              className="group flex items-center gap-2 rounded-lg p-1 hover:bg-muted"
              data-active={id === activeSessionId ? '' : undefined}
            >
              <button
                type="button"
                className="min-w-0 flex-1 px-2 py-2 text-left"
                onClick={() => selectSession(id)}
              >
                <strong className="block truncate text-sm font-medium">{session.title}</strong>
                <span className="text-xs text-muted-foreground">{messageCount} 条消息</span>
              </button>
              <Button
                variant="ghost"
                size="icon"
                className="size-8"
                aria-label={`重命名${session.title}`}
                onClick={() => {
                  const title = window.prompt('重命名会话', session.title)
                  if (title) {
                    renameSession(id, title)
                    renameSessionMutation.mutate({ id, title })
                  }
                }}
              >
                <Pencil size={14} />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="size-8 text-destructive hover:text-destructive"
                aria-label={`删除${session.title}`}
                onClick={() => {
                  deleteSession(id)
                  deleteSessionMutation.mutate(id)
                }}
              >
                <Trash2 size={14} />
              </Button>
            </div>
          )
        })}
        {!filteredIds.length ? (
          <p className="py-10 text-center text-sm text-muted-foreground">没有匹配的会话</p>
        ) : null}
      </div>
    </section>
  )
}
