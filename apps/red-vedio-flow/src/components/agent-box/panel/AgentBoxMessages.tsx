import { useEffect, useMemo, useRef } from 'react'
import { RefreshCcw, Sparkles } from 'lucide-react'
import { AgentBox } from '../AgentBox'
import { selectActiveMessageIds, useAgentBoxStore } from '../agentBoxStore'
import { usePiAgentPromptMutation } from '../piAgentQueries'
import { Button } from '@/components/ui/button'
import { AgentMessageAttachments } from './AgentMessageAttachments'
import { AgentMessageContent } from './AgentMessageContent'

function AgentMessageItem({ id }: { id: string }) {
  const message = useAgentBoxStore((state) => state.messagesById[id])
  const attachmentsById = useAgentBoxStore((state) => state.attachmentsById)
  const retry = useAgentBoxStore((state) => state.retry)
  const promptMutation = usePiAgentPromptMutation()
  const attachments = useMemo(
    () => message?.attachmentIds
      .map((attachmentId) => attachmentsById[attachmentId])
      .filter(Boolean) ?? [],
    [attachmentsById, message?.attachmentIds],
  )

  if (!message) return null

  if (message.role !== 'user' && message.role !== 'assistant') {
    return <AgentMessageContent message={message} />
  }

  return (
    <AgentBox.Message role={message.role} data-status={message.status}>
      <AgentMessageContent message={message} />
      <AgentMessageAttachments attachments={attachments} />
      {message.status === 'streaming' ? (
        <span className="mt-2 inline-block size-1.5 animate-pulse rounded-full bg-current opacity-60" />
      ) : null}
      {message.role === 'assistant' && (message.status === 'error' || message.status === 'stopped') ? (
        <Button
          variant="ghost"
          size="sm"
          className="mt-2 h-7 px-2 text-xs"
          onClick={() => void retry(
            message.id,
            (sessionId, input, signal, onEvent) =>
              promptMutation.mutateAsync({ sessionId, input, signal, onEvent }),
          )}
        >
          <RefreshCcw size={12} />
          重试
        </Button>
      ) : null}
    </AgentBox.Message>
  )
}

export function AgentBoxMessages() {
  const messageIds = useAgentBoxStore(selectActiveMessageIds)
  const autoScroll = useAgentBoxStore((state) => state.autoScroll)
  const activeAssistantText = useAgentBoxStore((state) =>
    state.activeAssistantMessageId
      ? state.messagesById[state.activeAssistantMessageId]?.text
      : undefined,
  )
  const setAutoScroll = useAgentBoxStore((state) => state.setAutoScroll)
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!autoScroll) return
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [activeAssistantText, autoScroll, messageIds])

  return (
    <AgentBox.Messages
      ref={scrollRef}
      onScroll={(event) => {
        const element = event.currentTarget
        const nearBottom = element.scrollHeight - element.scrollTop - element.clientHeight < 48
        if (nearBottom !== autoScroll) setAutoScroll(nearBottom)
      }}
    >
      {!messageIds.length ? (
        <div className="mx-auto flex max-w-xs flex-col items-center py-10 text-center">
          <div className="grid size-11 place-items-center rounded-2xl border bg-card shadow-sm">
            <Sparkles size={19} />
          </div>
          <h3 className="mt-3 text-sm font-medium">开始一个新任务</h3>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            描述你想制作的内容，Agent 会结合当前上下文提供建议。
          </p>
        </div>
      ) : messageIds.map((id) => <AgentMessageItem key={id} id={id} />)}
      {!autoScroll ? (
        <Button
          variant="secondary"
          size="sm"
          className="sticky bottom-0 mx-auto"
          onClick={() => setAutoScroll(true)}
        >
          回到底部
        </Button>
      ) : null}
    </AgentBox.Messages>
  )
}
