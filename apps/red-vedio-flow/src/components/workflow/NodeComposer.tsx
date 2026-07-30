import { useEffect, useRef, useState } from 'react'
import { ArrowUp, Paperclip, SlidersHorizontal, Square } from 'lucide-react'
import type {
  AssetReference,
  GenerationConfig,
  ModelSelection,
  NodeRunStatus,
} from '@red-video-flow/workflow-core'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { NodeComposerSettings } from './NodeComposerSettings'
import type { WorkflowNodeKind } from './workflowTypes'

type NodeComposerProps = {
  value: string
  attachments: AssetReference[]
  kind: WorkflowNodeKind
  model: ModelSelection
  generationConfig: GenerationConfig
  placeholder: string
  onValueChange: (value: string) => void
  onFilesSelected: (files: File[]) => Promise<void>
  onModelChange: (model: ModelSelection, config: GenerationConfig) => void
  onGenerationConfigChange: (config: GenerationConfig) => void
  onSubmit: () => void
  executionStatus?: NodeRunStatus
  onCancel?: () => void
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
  onModelChange,
  onGenerationConfigChange,
  onSubmit,
  executionStatus,
  onCancel,
}: NodeComposerProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const isComposingRef = useRef(false)
  const [draft, setDraft] = useState(value)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const isRunning = executionStatus === 'queued' || executionStatus === 'running'
  const acceptedFileTypes = kind === 'image'
    ? 'image/*'
    : kind === 'video'
      ? 'video/*'
      : 'image/*,video/*'

  useEffect(() => {
    if (!isComposingRef.current && value !== draft) {
      setDraft(value)
    }
  }, [draft, value])

  return (
    <div
      className="nodrag nowheel mt-2 w-[520px] rounded-xl border bg-background px-4 pb-3 pt-3 shadow-sm focus-within:border-foreground/30 focus-within:ring-1 focus-within:ring-ring/20"
      data-workflow-node-composer=""
    >
      {attachments.length ? (
        <div className="mb-2 flex flex-wrap gap-1.5" data-workflow-composer-attachments="">
          {attachments.map((attachment) => (
            <span
              key={attachment.id}
              className="max-w-44 truncate rounded-md bg-muted px-2 py-1 text-[11px] text-muted-foreground"
            >
              {attachment.name ?? attachment.kind}
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
