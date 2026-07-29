import { Bot } from 'lucide-react'
import { FeatureErrorBoundary } from '../../extension-system/FeatureErrorBoundary'
import { useAgentMessageList } from './AgentMessageList.logic'
import type { ChatMessage } from './agentChatTypes'
import styles from './AgentDrawer.module.less'

type Props = {
  messages: ChatMessage[]
  isActive: boolean
}

export function AgentMessageList({ messages, isActive }: Props) {
  const messageList = useAgentMessageList(messages, isActive)

  return (
    <section className={styles.messages} aria-live="polite">
      {messages.length === 0 ? (
        <div className={styles.emptyMessage}>
          <Bot size={28} />
          <p>可以询问如何拆解短视频工作流，或 @ 引用节点、资源来继续创作。</p>
        </div>
      ) : (
        messages.map((message) => {
          const renderer = messageList.getRenderer(message)
          if (!renderer) {
            return (
              <div key={message.id} className={styles.message} data-status="error">
                不支持的消息类型：{message.kind ?? 'text'}
              </div>
            )
          }
          const MessageRenderer = renderer.component
          return (
            <FeatureErrorBoundary key={message.id} contributionId={renderer.id}>
              <MessageRenderer message={message} />
            </FeatureErrorBoundary>
          )
        })
      )}
      <div ref={messageList.endRef} />
    </section>
  )
}
