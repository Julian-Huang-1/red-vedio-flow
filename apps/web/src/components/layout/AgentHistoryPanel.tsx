import { MessageSquarePlus, Pencil, Search, Trash2 } from 'lucide-react'
import type { ChatSession } from '@red-video-flow/workflow-client'
import styles from './AgentDrawer.module.less'

type Props = {
  sessions: ChatSession[]
  activeId?: string
  query: string
  error?: string
  onQueryChange: (query: string) => void
  onSelect: (id: string) => void
  onCreate: () => void
  onRename: (id: string, title: string) => void
  onDelete: (id: string) => void
}

export function AgentHistoryPanel({
  sessions,
  activeId,
  query,
  error,
  onQueryChange,
  onSelect,
  onCreate,
  onRename,
  onDelete,
}: Props) {
  return (
    <section className={styles.historyPanel} data-agent-history="">
      <div className={styles.historyToolbar}>
        <label>
          <Search size={14} />
          <input
            value={query}
            placeholder="搜索历史对话"
            onChange={(event) => onQueryChange(event.target.value)}
          />
        </label>
        <button type="button" title="新建对话" onClick={onCreate}>
          <MessageSquarePlus size={16} />
        </button>
      </div>
      <div className={styles.historyList}>
        {sessions.length === 0 ? <p className={styles.historyEmpty}>{error ?? '暂无历史对话'}</p> : null}
        {sessions.map((session) => (
          <article
            key={session.id}
            className={styles.historyItem}
            data-active={session.id === activeId ? '' : undefined}
            data-agent-history-item=""
          >
            <button type="button" className={styles.historyMain} onClick={() => onSelect(session.id)}>
              <strong>{session.title}</strong>
              <time>{formatTime(session.updatedAt)}</time>
            </button>
            <div className={styles.historyItemActions}>
              <button type="button" title="重命名" onClick={() => onRename(session.id, session.title)}>
                <Pencil size={13} />
              </button>
              <button type="button" title="删除" onClick={() => onDelete(session.id)}>
                <Trash2 size={13} />
              </button>
            </div>
          </article>
        ))}
      </div>
    </section>
  )
}

function formatTime(value: number) {
  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(value)
}
