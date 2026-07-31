import { useEffect, useMemo, useRef } from 'react'
import { ArrowDown, RefreshCcw, Sparkles } from 'lucide-react'
import { AgentBox } from '../AgentBox'
import { selectActiveMessageIds, useAgentBoxStore } from '../agentBoxStore'
import { usePiAgentPromptMutation } from '../piAgentQueries'
import { Button } from '@/components/ui/button'
import { AgentMessageAttachments } from './AgentMessageAttachments'
import { AgentMessageContent } from './AgentMessageContent'

function AgentMessageItem({ id }: { id: string }) {
  const message = useAgentBoxStore((state) => state.messagesById[id])
  const attachmentsById = useAgentBoxStore((state) => state.attachmentsById)
  const resourcesById = useAgentBoxStore((state) => state.resourcesById)
  const retry = useAgentBoxStore((state) => state.retry)
  const promptMutation = usePiAgentPromptMutation()
  const attachments = useMemo(
    () => message?.attachmentIds
      .map((attachmentId) => attachmentsById[attachmentId])
      .filter(Boolean) ?? [],
    [attachmentsById, message?.attachmentIds],
  )
  const resources = useMemo(
    () => message?.resourceIds
      ?.map((resourceId) => resourcesById[resourceId])
      .filter(Boolean) ?? [],
    [message?.resourceIds, resourcesById],
  )

  if (!message) return null

  if (message.role !== 'user' && message.role !== 'assistant') {
    return (
      <div
        className="w-full min-w-0 pl-10"
        data-agent-box-message-event=""
        data-status={message.status}
      >
        <AgentMessageContent message={message} />
      </div>
    )
  }

  return (
    <AgentBox.Message role={message.role} data-status={message.status}>
      <AgentMessageContent message={message} />
      <AgentMessageAttachments attachments={attachments} resources={resources} />
      {message.status === 'streaming' ? (
        <span
          className="mt-2 inline-flex items-center gap-1.5 text-xs text-muted-foreground"
          data-agent-box-message-streaming=""
        >
          <span className="size-1.5 animate-pulse rounded-full bg-current" />
          正在生成
        </span>
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
    const frame = requestAnimationFrame(() => {
      const element = scrollRef.current
      if (element) element.scrollTop = element.scrollHeight
    })
    return () => cancelAnimationFrame(frame)
  }, [activeAssistantText, autoScroll, messageIds])

  function scrollToBottom() {
    setAutoScroll(true)
    const element = scrollRef.current
    if (element) element.scrollTo({ top: element.scrollHeight, behavior: 'smooth' })
  }

  return (
    <AgentBox.Messages
      ref={scrollRef}
      onScroll={(event) => {
        const element = event.currentTarget
        const nearBottom = element.scrollHeight - element.scrollTop - element.clientHeight < 80
        if (nearBottom !== autoScroll) setAutoScroll(nearBottom)
      }}
    >
      {!messageIds.length ? (
        <div
          className="mx-auto flex min-h-full max-w-xs flex-1 flex-col items-center justify-center py-10 text-center"
          data-agent-box-messages-empty=""
        >
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
          className="sticky bottom-2 z-10 mx-auto gap-1.5 rounded-full border bg-background/95 px-3 shadow-lg backdrop-blur"
          data-agent-box-scroll-to-bottom=""
          onClick={scrollToBottom}
        >
          <ArrowDown size={14} />
          回到底部
        </Button>
      ) : null}
    </AgentBox.Messages>
  )
}
