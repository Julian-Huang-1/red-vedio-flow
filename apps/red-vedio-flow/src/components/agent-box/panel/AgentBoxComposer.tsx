import { useRef } from 'react'
import { AtSign, File, Paperclip, Send, Square, X } from 'lucide-react'
import { AgentBox } from '../AgentBox'
import {
  selectCanSubmit,
  selectIsRunning,
  useAgentBoxStore,
} from '../agentBoxStore'
import {
  useAbortPiAgentPromptMutation,
  usePiAgentPromptMutation,
} from '../piAgentQueries'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'

function PendingAttachments() {
  const attachments = useAgentBoxStore((state) => state.pendingAttachments)
  const removeAttachment = useAgentBoxStore((state) => state.removeAttachment)

  if (!attachments.length) return null

  return (
    <div className="flex flex-wrap gap-2 border-b px-3 py-2">
      {attachments.map((attachment) => (
        <Badge key={attachment.id} variant="secondary" className="gap-1.5 py-1 pl-2.5 pr-1">
          <File size={12} />
          <span className="max-w-40 truncate">{attachment.name}</span>
          <Button
            variant="ghost"
            size="icon"
            className="size-6"
            aria-label={`移除${attachment.name}`}
            onClick={() => removeAttachment(attachment.id)}
          >
            <X size={12} />
          </Button>
        </Badge>
      ))}
    </div>
  )
}

export function AgentBoxComposer() {
  const draft = useAgentBoxStore((state) => state.draft)
  const isRunning = useAgentBoxStore(selectIsRunning)
  const canSubmit = useAgentBoxStore(selectCanSubmit)
  const runError = useAgentBoxStore((state) => state.runError)
  const setDraft = useAgentBoxStore((state) => state.setDraft)
  const addAttachment = useAgentBoxStore((state) => state.addAttachment)
  const mentionNode = useAgentBoxStore((state) => state.mentionNode)
  const submit = useAgentBoxStore((state) => state.submit)
  const stop = useAgentBoxStore((state) => state.stop)
  const promptMutation = usePiAgentPromptMutation()
  const abortMutation = useAbortPiAgentPromptMutation()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const submitWithMutation = () => submit(
    (sessionId, input, signal, onEvent) =>
      promptMutation.mutateAsync({ sessionId, input, signal, onEvent }),
  )

  return (
    <AgentBox.Composer>
      <div className="overflow-hidden rounded-xl border bg-background shadow-sm focus-within:ring-2 focus-within:ring-ring">
        <PendingAttachments />
        <textarea
          className="min-h-24 w-full resize-none bg-transparent px-3.5 py-3 text-sm outline-none placeholder:text-muted-foreground"
          value={draft}
          placeholder="描述任务，或使用 @ 引用节点…"
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault()
              void submitWithMutation()
            }
          }}
        />
        <div className="flex items-center justify-between border-t px-2 py-2">
          <div className="flex items-center">
            <input
              ref={fileInputRef}
              type="file"
              multiple
              className="hidden"
              onChange={(event) => {
                Array.from(event.target.files ?? []).forEach(addAttachment)
                event.target.value = ''
              }}
            />
            <Button
              variant="ghost"
              size="icon"
              aria-label="添加附件"
              onClick={() => fileInputRef.current?.click()}
            >
              <Paperclip size={16} />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              aria-label="引用节点"
              onClick={() => mentionNode('node-storyboard', '分镜脚本')}
            >
              <AtSign size={16} />
            </Button>
          </div>
          {isRunning ? (
            <Button
              variant="ghost"
              size="icon"
              className="bg-foreground/10 hover:bg-foreground/20"
              aria-label="停止生成"
              onClick={() => stop((sessionId) => abortMutation.mutateAsync(sessionId))}
            >
              <Square size={14} />
            </Button>
          ) : (
            <Button
              size="icon"
              aria-label="发送"
              disabled={!canSubmit}
              onClick={() => void submitWithMutation()}
            >
              <Send size={16} />
            </Button>
          )}
        </div>
      </div>
      {runError ? <p className="mt-2 text-xs text-destructive">{runError}</p> : null}
    </AgentBox.Composer>
  )
}
