import { History, Settings, TerminalSquare, X } from 'lucide-react'
import styles from './AgentDrawer.module.less'

type Props = {
  onClose: () => void
}

export function AgentDrawerHeader({ onClose }: Props) {
  return (
    <header className={styles.header}>
      <div className={styles.title}>新对话</div>
      <div className={styles.headerActions}>
        <button type="button" title="历史对话">
          <History size={17} />
        </button>
        <button type="button" title="Agent 设置">
          <Settings size={17} />
        </button>
        <button type="button" title="CLI & Skill">
          <TerminalSquare size={17} />
        </button>
        <button type="button" title="关闭" onClick={onClose}>
          <X size={18} />
        </button>
      </div>
    </header>
  )
}
