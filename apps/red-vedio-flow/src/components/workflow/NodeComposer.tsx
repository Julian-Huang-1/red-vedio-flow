import { useEffect, useRef, useState } from 'react'
import { ArrowUp, Paperclip, SlidersHorizontal } from 'lucide-react'
import type {
  AssetReference,
  GenerationConfig,
  ModelSelection,
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
  onAttachment: (attachment: AssetReference) => void
  onModelChange: (model: ModelSelection, config: GenerationConfig) => void
  onGenerationConfigChange: (config: GenerationConfig) => void
  onSubmit: () => void
}

export function NodeComposer({
  value,
  attachments,
  kind,
  model,
  generationConfig,
  placeholder,
  onValueChange,
  onAttachment,
  onModelChange,
  onGenerationConfigChange,
  onSubmit,
}: NodeComposerProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const isComposingRef = useRef(false)
  const [draft, setDraft] = useState(value)
  const [settingsOpen, setSettingsOpen] = useState(false)

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
            accept="image/*,video/*"
            multiple
            onChange={(event) => {
              for (const file of Array.from(event.target.files ?? [])) {
                onAttachment({
                  id: `local-${file.name}-${file.lastModified}`,
                  kind: file.type.startsWith('video/') ? 'video' : 'image',
                  url: URL.createObjectURL(file),
                  name: file.name,
                  mimeType: file.type,
                  size: file.size,
                })
              }
              event.target.value = ''
            }}
          />
          <Button
            variant="ghost"
            size="icon"
            className="size-6 text-muted-foreground"
            aria-label="添加素材"
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
          className="size-6 rounded-lg"
          aria-label="提交节点任务"
          disabled={!draft.trim()}
          onClick={onSubmit}
        >
          <ArrowUp size={13} />
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
