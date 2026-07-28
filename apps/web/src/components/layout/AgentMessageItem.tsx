import { LoaderCircle, TerminalSquare, TriangleAlert } from 'lucide-react'
import type { ChatMessage } from './agentChatTypes'
import styles from './AgentDrawer.module.less'

type Props = {
  message: ChatMessage
}

export function AgentMessageItem({ message }: Props) {
  const isRunning = message.status === 'pending' || message.status === 'streaming'
  const stderr = message.run?.stderr.join('').trim()

  return (
    <div className={styles.message} data-role={message.role} data-status={message.status}>
      {message.text ? <div className={styles.messageText}>{message.text}</div> : null}

      {message.role === 'assistant' && isRunning ? (
        <div className={styles.messageStatus}>
          <LoaderCircle className={styles.statusSpinner} size={14} />
          <span>{message.status === 'pending' ? '正在连接本地 Agent…' : `${message.run?.agentLabel ?? 'Agent'} 正在处理…`}</span>
        </div>
      ) : null}

      {message.role === 'assistant' && message.error ? (
        <div className={styles.messageError}>
          <TriangleAlert size={14} />
          <span>{message.error}</span>
        </div>
      ) : null}

      {message.role === 'assistant' && stderr ? (
        <details className={styles.runDetails}>
          <summary>
            <TerminalSquare size={13} />
            运行日志
          </summary>
          {message.run?.bin ? (
            <div className={styles.runCommand}>
              {[message.run.bin, ...(message.run.argv ?? [])].join(' ')}
            </div>
          ) : null}
          <pre>{stderr}</pre>
        </details>
      ) : null}
    </div>
  )
}
