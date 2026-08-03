import { useEffect, useRef, useState } from 'react'
import { ArrowUp, Paperclip, SlidersHorizontal, Square, X } from 'lucide-react'
import type {
  AssetReference,
  GenerationConfig,
  ModelSelection,
  NodeRunStatus,
} from '@red-video-flow/workflow-core'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { NodeComposerSettings } from './NodeComposerSettings'
import { CapabilityLabelButton } from './CapabilityLabelButton'
import type { WorkflowNodeKind } from './workflowTypes'
import { VoiceInputButton } from '@/components/voice-input'

type NodeComposerProps = {
  value: string
  attachments: AssetReference[]
  kind: WorkflowNodeKind
  model: ModelSelection
  generationConfig: GenerationConfig
  placeholder: string
  onValueChange: (value: string) => void
  onFilesSelected: (files: File[]) => Promise<void>
  onAttachmentRemove: (attachmentId: string) => void
  onFocusTarget: () => void
  onModelChange: (model: ModelSelection, config: GenerationConfig) => void
  onGenerationConfigChange: (config: GenerationConfig) => void
  onSubmit: () => void
  executionStatus?: NodeRunStatus
  onCancel?: () => void
  capabilityLabels?: { input: boolean; output: boolean }
  onCapabilityLabelToggle?: (direction: 'input' | 'output') => void
}

export function NodeComposer({
  value,
  attachments,
  kind,
  model,
  generationConfig,
  placeholder,
  onValueChange,
  onFilesSelected,
  onAttachmentRemove,
  onFocusTarget,
  onModelChange,
  onGenerationConfigChange,
  onSubmit,
  executionStatus,
  onCancel,
  capabilityLabels,
  onCapabilityLabelToggle,
}: NodeComposerProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const isComposingRef = useRef(false)
  const lastLocalValueRef = useRef(value)
  const [draft, setDraft] = useState(value)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const isRunning = executionStatus === 'queued' || executionStatus === 'running'
  const acceptedFileTypes = kind === 'image'
    ? 'image/*'
    : kind === 'video'
      ? 'video/*'
      : kind === 'audio'
        ? 'audio/*'
      : 'image/*,video/*'

  useEffect(() => {
    if (isComposingRef.current || value === lastLocalValueRef.current) return
    lastLocalValueRef.current = value
    setDraft(value)
  }, [value])

  return (
    <div
      className="nodrag nowheel mt-2 w-[520px] rounded-xl border bg-background px-4 pb-3 pt-3 shadow-sm focus-within:border-foreground/30 focus-within:ring-1 focus-within:ring-ring/20"
      data-workflow-node-composer=""
      onPointerDownCapture={onFocusTarget}
    >
      {attachments.length ? (
        <div className="mb-2 flex flex-wrap gap-1.5" data-workflow-composer-attachments="">
          {attachments.map((attachment) => (
            <span
              key={attachment.id}
              className="group flex max-w-48 items-center gap-1 rounded-md bg-muted py-1 pl-2 pr-1 text-[11px] text-muted-foreground"
            >
              <span className="min-w-0 truncate">
                {attachment.name ?? attachment.kind}
              </span>
              <button
                type="button"
                className="grid size-4 shrink-0 place-items-center rounded-sm text-muted-foreground/70 hover:bg-background hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                aria-label={`删除附件 ${attachment.name ?? attachment.kind}`}
                title="删除附件"
                onClick={() => onAttachmentRemove(attachment.id)}
              >
                <X size={11} />
              </button>
            </span>
          ))}
        </div>
      ) : null}
      <Textarea
        className="min-h-[76px] resize-none rounded-none border-0 bg-transparent p-0 leading-6 shadow-none focus-visible:ring-0 focus-visible:ring-offset-0"
        value={draft}
        placeholder={placeholder}
        onChange={(event) => {
          const nextValue = event.target.value
          lastLocalValueRef.current = nextValue
          setDraft(nextValue)
          if (!isComposingRef.current) {
            onValueChange(nextValue)
          }
        }}
        onCompositionStart={() => {
          isComposingRef.current = true
        }}
        onCompositionEnd={(event) => {
          isComposingRef.current = false
          const nextValue = event.currentTarget.value
          lastLocalValueRef.current = nextValue
          setDraft(nextValue)
          onValueChange(nextValue)
        }}
        onKeyDown={(event) => {
          if (
            isComposingRef.current
            || event.nativeEvent.isComposing
            || event.nativeEvent.keyCode === 229
          ) {
            return
          }
          if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault()
            if (draft.trim()) onSubmit()
          }
        }}
      />
      <div className="mt-1 flex items-center justify-between">
        <div className="flex items-center gap-2">
          {capabilityLabels && onCapabilityLabelToggle ? (
            <>
              <CapabilityLabelButton direction="input" target="composer" active={capabilityLabels.input} onClick={() => onCapabilityLabelToggle('input')} />
              <CapabilityLabelButton direction="output" target="composer" active={capabilityLabels.output} onClick={() => onCapabilityLabelToggle('output')} />
            </>
          ) : null}
          <input
            ref={fileInputRef}
            className="hidden"
            type="file"
            accept={acceptedFileTypes}
            multiple
            onChange={(event) => {
              void onFilesSelected(Array.from(event.target.files ?? []))
              event.target.value = ''
            }}
          />
          <Button
            variant="ghost"
            size="icon"
            className="size-6 text-muted-foreground"
            aria-label={kind === 'image' ? '上传图片' : kind === 'video' ? '上传视频' : '添加素材'}
            title={kind === 'image' ? '上传图片' : kind === 'video' ? '上传视频' : '添加素材'}
            onClick={() => fileInputRef.current?.click()}
          >
            <Paperclip size={13} />
          </Button>
          <VoiceInputButton
            className="size-6"
            disabled={isRunning}
            onTranscript={(text) => {
              setDraft((current) => {
                const nextValue = appendTranscript(current, text)
                lastLocalValueRef.current = nextValue
                onValueChange(nextValue)
                return nextValue
              })
            }}
          />
          <span className="max-w-52 truncate text-[10px] text-muted-foreground">
            {model.modelId}
          </span>
          <Button
            type="button"
            variant={settingsOpen ? 'secondary' : 'ghost'}
            size="icon"
            className="size-6 text-muted-foreground"
            aria-label="模型参数"
            aria-expanded={settingsOpen}
            onClick={() => setSettingsOpen((current) => !current)}
          >
            <SlidersHorizontal size={13} />
          </Button>
        </div>
        <Button
          size="icon"
          variant={isRunning ? 'secondary' : 'default'}
          className="size-6 rounded-lg"
          aria-label={isRunning ? '停止节点任务' : '提交节点任务'}
          disabled={!isRunning && !draft.trim()}
          onClick={isRunning ? onCancel : onSubmit}
        >
          {isRunning ? <Square size={11} fill="currentColor" /> : <ArrowUp size={13} />}
        </Button>
      </div>
      {settingsOpen ? (
        <NodeComposerSettings
          kind={kind}
          model={model}
          generationConfig={generationConfig}
          onModelChange={onModelChange}
          onGenerationConfigChange={onGenerationConfigChange}
        />
      ) : null}
    </div>
  )
}

function appendTranscript(current: string, transcript: string) {
  const text = transcript.trim()
  if (!text) return current
  if (!current || /\s$/.test(current)) return `${current}${text}`
  return `${current} ${text}`
}
