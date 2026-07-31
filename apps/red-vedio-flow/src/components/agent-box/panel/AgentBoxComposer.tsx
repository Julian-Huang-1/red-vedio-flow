import { useRef } from 'react'
import { AtSign, File, FileText, Image, Library, Paperclip, Send, Square, Video, X } from 'lucide-react'
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
import { useResourceLibraryStore } from '@/stores/resourceLibraryStore'

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

function PendingResources() {
  const resources = useAgentBoxStore((state) => state.pendingResources)
  const removeResource = useAgentBoxStore((state) => state.removeResource)
  if (!resources.length) return null

  return (
    <div className="border-b px-3 py-2" data-agent-box-pending-resources="">
      <p className="mb-2 text-[11px] font-medium text-muted-foreground">
        画布资源 · {resources.length}
      </p>
      <div className="flex gap-2 overflow-x-auto pb-0.5">
        {resources.map((resource) => {
          const Icon = resource.kind === 'image'
            ? Image
            : resource.kind === 'video'
              ? Video
              : resource.kind === 'text' ? FileText : File
          return (
            <div
              key={resource.id}
              className="relative flex w-28 shrink-0 items-center gap-2 rounded-lg border bg-muted/35 p-1.5 pr-7"
              data-agent-box-pending-resource=""
            >
              {resource.kind === 'image' && (resource.thumbnailUrl || resource.url) ? (
                <img
                  src={resource.thumbnailUrl || resource.url}
                  alt=""
                  className="size-8 shrink-0 rounded object-cover"
                />
              ) : (
                <span className="grid size-8 shrink-0 place-items-center rounded bg-background">
                  <Icon size={14} />
                </span>
              )}
              <span className="truncate text-[11px] font-medium">{resource.name}</span>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="absolute right-0.5 top-0.5 size-6"
                aria-label={`移除${resource.name}`}
                onClick={() => removeResource(resource.id)}
              >
                <X size={11} />
              </Button>
            </div>
          )
        })}
      </div>
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
  const selectedAgentId = useAgentBoxStore((state) => state.selectedAgentId)
  const mentionNode = useAgentBoxStore((state) => state.mentionNode)
  const submit = useAgentBoxStore((state) => state.submit)
  const stop = useAgentBoxStore((state) => state.stop)
  const promptMutation = usePiAgentPromptMutation()
  const abortMutation = useAbortPiAgentPromptMutation()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const openResourceLibrary = useResourceLibraryStore((state) => state.openForAgent)
  const submitWithMutation = () => submit(
    (sessionId, input, signal, onEvent) =>
      promptMutation.mutateAsync({ sessionId, input, signal, onEvent }),
  )

  return (
    <AgentBox.Composer>
      <div className="overflow-hidden rounded-xl border bg-background shadow-sm focus-within:ring-2 focus-within:ring-ring">
        <PendingAttachments />
        <PendingResources />
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
              accept="image/*,text/*,.json,.xml"
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
            {selectedAgentId === 'app-builder-agent' ? (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label="选择画布资源"
                title="选择画布资源"
                onClick={openResourceLibrary}
              >
                <Library size={16} />
              </Button>
            ) : null}
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
