import { useEffect, useRef, useState } from 'react'
import { Handle, Position, type NodeProps } from '@xyflow/react'
import { Check, Copy, FileText, Image, LoaderCircle, Pencil, Upload, Video } from 'lucide-react'
import { useTaskStore } from '@/stores/taskStore'
import { useWorkflowStore } from '@/stores/workflowStore'
import { createResourceBinding, uploadAsset } from '@red-video-flow/workflow-client'
import { queryClient } from '@/lib/queryClient'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { NodeComposer } from './NodeComposer'
import type { WorkflowFlowNode, WorkflowNodeKind } from './workflowTypes'

const nodePresentation = {
  text: {
    icon: FileText,
    label: 'TEXT',
  },
  image: {
    icon: Image,
    label: 'IMAGE',
  },
  video: {
    icon: Video,
    label: 'VIDEO',
  },
} satisfies Record<WorkflowNodeKind, {
  icon: typeof FileText
  label: string
}>

export function WorkflowNode({ id, data, selected }: NodeProps<WorkflowFlowNode>) {
  const [copied, setCopied] = useState(false)
  const [uploadingContent, setUploadingContent] = useState(false)
  const [uploadError, setUploadError] = useState<string>()
  const [editingText, setEditingText] = useState(false)
  const [textDraft, setTextDraft] = useState('')
  const contentFileInputRef = useRef<HTMLInputElement>(null)
  const presentation = nodePresentation[data.kind]
  const Icon = presentation.icon
  const updateComposer = useWorkflowStore((state) => state.updateComposer)
  const addAttachment = useWorkflowStore((state) => state.addAttachment)
  const appendResult = useWorkflowStore((state) => state.appendResult)
  const workflowId = useWorkflowStore((state) => state.workflowId)
  const submitNode = useTaskStore((state) => state.submitNode)
  const cancelRun = useTaskStore((state) => state.cancelRun)
  const runStatus = useTaskStore((state) => (
    data.latestRunId ? state.runs[data.latestRunId]?.status : undefined
  ))
  const streamingText = useTaskStore((state) => (
    data.latestRunId ? state.progress[data.latestRunId]?.text ?? '' : ''
  ))
  const partialImage = useTaskStore((state) => {
    if (!data.latestRunId) return undefined
    const images = state.progress[data.latestRunId]?.partialImages
    if (!images) return undefined
    const indexes = Object.keys(images).map(Number).sort((left, right) => right - left)
    return indexes.length ? images[indexes[0]] : undefined
  })
  const runError = useTaskStore((state) => (
    data.latestRunId ? state.runs[data.latestRunId]?.error?.message : undefined
  ))
  const workflowNodeState = useTaskStore((state) => state.workflowRun?.nodeStates[id])
  const currentResult = data.results.find((result) => result.id === data.currentResultId)
  const copyableContent = getCopyableContent(currentResult, streamingText)

  useEffect(() => {
    if (!copied) return
    const timer = window.setTimeout(() => setCopied(false), 1_500)
    return () => window.clearTimeout(timer)
  }, [copied])

  const submit = () => {
    if (!data.composer.prompt.trim()) return
    void submitNode(id)
  }

  const uploadNodeContent = async (file: File) => {
    const expectedType = data.kind === 'image' ? 'image/' : 'video/'
    if (!file.type.startsWith(expectedType)) {
      setUploadError(data.kind === 'image' ? '请选择图片文件' : '请选择视频文件')
      return
    }
    setUploadingContent(true)
    setUploadError(undefined)
    try {
      const asset = await uploadAsset(file, workflowId)
      const reference = {
        id: asset.id,
        kind: data.kind,
        url: asset.url,
        name: asset.fileName,
        mimeType: asset.mimeType,
      } as const
      const resultId = `upload-result-${asset.id}`
      const runId = `upload-${asset.id}`
      if (data.kind === 'image') {
        appendResult(id, {
          id: resultId,
          runId,
          type: 'image',
          images: [{ ...reference, kind: 'image' }],
          provider: { providerId: 'upload' },
          createdAt: Date.now(),
        })
      } else {
        appendResult(id, {
          id: resultId,
          runId,
          type: 'video',
          video: { ...reference, kind: 'video' },
          provider: { providerId: 'upload' },
          createdAt: Date.now(),
        })
      }
      await createResourceBinding({
        resourceId: asset.id,
        workflowId,
        nodeId: id,
        runId,
        resultId,
        relation: 'node-content',
      })
      await queryClient.invalidateQueries({ queryKey: ['resources'] })
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : String(error))
    } finally {
      setUploadingContent(false)
    }
  }

  const openTextEditor = () => {
    setTextDraft(currentResult?.type === 'text' ? currentResult.text : streamingText)
    setEditingText(true)
  }

  const saveTextContent = () => {
    const timestamp = Date.now()
    appendResult(id, {
      id: `manual-text-result-${timestamp}`,
      runId: `manual-text-${timestamp}`,
      type: 'text',
      text: textDraft,
      provider: { providerId: 'manual' },
      createdAt: timestamp,
    })
    setEditingText(false)
  }

  const cancelTextEditing = () => {
    setEditingText(false)
    setTextDraft('')
  }

  return (
    <article
      className="group relative w-[520px] text-card-foreground"
      data-workflow-node=""
      data-kind={data.kind}
      data-selected={selected ? '' : undefined}
      data-node-status={data.status}
      data-execution-state={runStatus ?? 'idle'}
      data-workflow-execution-state={workflowNodeState?.status ?? 'idle'}
    >
      <div
        className="relative mx-auto w-[360px]"
        data-workflow-node-card=""
      >
        <Handle
          type="target"
          position={Position.Left}
          className="!size-2.5 !border-2 !border-background !bg-foreground"
        />
        <div className="overflow-hidden rounded-xl border bg-card shadow-sm transition-[border-color,box-shadow] group-data-[selected]:border-foreground/40 group-data-[selected]:shadow-md">
          <header
            className="flex h-9 items-center gap-2 border-b px-3"
            data-workflow-node-header=""
          >
            <Icon size={14} className="text-muted-foreground" />
            <h2 className="min-w-0 flex-1 truncate text-[13px] font-medium">{data.title}</h2>
            <span className="rounded-full bg-muted px-2 py-0.5 text-[9px] font-medium tracking-wider text-muted-foreground">
              {workflowNodeState?.status === 'running'
                ? 'RUNNING'
                : data.executionMode === 'input'
                  ? 'INPUT'
                  : presentation.label}
            </span>
            {data.kind === 'image' || data.kind === 'video' ? (
              <>
                <input
                  ref={contentFileInputRef}
                  type="file"
                  className="hidden"
                  accept={data.kind === 'image' ? 'image/*' : 'video/*'}
                  onChange={(event) => {
                    const file = event.target.files?.[0]
                    if (file) void uploadNodeContent(file)
                    event.target.value = ''
                  }}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="nodrag nopan size-7 text-muted-foreground hover:text-foreground"
                  aria-label={data.kind === 'image' ? '上传并覆盖节点图片' : '上传并覆盖节点视频'}
                  title={data.kind === 'image' ? '上传图片到节点' : '上传视频到节点'}
                  disabled={uploadingContent}
                  data-workflow-node-upload=""
                  onPointerDown={(event) => event.stopPropagation()}
                  onClick={(event) => {
                    event.stopPropagation()
                    contentFileInputRef.current?.click()
                  }}
                >
                  {uploadingContent
                    ? <LoaderCircle className="size-3.5 animate-spin" />
                    : <Upload className="size-3.5" />}
                </Button>
              </>
            ) : null}
            {data.kind === 'text' ? (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="nodrag nopan size-7 text-muted-foreground hover:text-foreground"
                aria-label="编辑节点文本"
                title="编辑节点文本"
                data-workflow-node-edit=""
                onPointerDown={(event) => event.stopPropagation()}
                onClick={(event) => {
                  event.stopPropagation()
                  if (editingText) {
                    saveTextContent()
                  } else {
                    openTextEditor()
                  }
                }}
              >
                {editingText ? <Check className="size-3.5" /> : <Pencil className="size-3.5" />}
              </Button>
            ) : null}
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="nodrag nopan -mr-1 size-7 text-muted-foreground hover:text-foreground"
              aria-label="复制节点内容"
              title={copyableContent ? '复制节点内容' : '暂无可复制内容'}
              disabled={!copyableContent}
              data-workflow-node-copy=""
              onPointerDown={(event) => event.stopPropagation()}
              onClick={async (event) => {
                event.stopPropagation()
                if (!copyableContent) return
                await navigator.clipboard.writeText(copyableContent)
                setCopied(true)
              }}
            >
              {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
            </Button>
          </header>
          {data.kind === 'text' && editingText ? (
            <Textarea
              autoFocus
              value={textDraft}
              className="nodrag nopan h-[220px] resize-none rounded-none border-0 px-5 py-4 text-sm leading-6 shadow-none focus-visible:ring-0"
              placeholder="输入节点文本内容"
              data-workflow-node-textarea=""
              onPointerDown={(event) => event.stopPropagation()}
              onChange={(event) => setTextDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Escape') {
                  event.preventDefault()
                  cancelTextEditing()
                } else if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
                  event.preventDefault()
                  saveTextContent()
                }
              }}
            />
          ) : (
            <NodePreview
              kind={data.kind}
              result={currentResult}
              streamingText={streamingText}
              partialImage={partialImage}
              error={uploadError ?? runError ?? workflowNodeState?.error}
            />
          )}
        </div>
        <Handle
          type="source"
          position={Position.Right}
          className="!size-2.5 !border-2 !border-background !bg-foreground"
        />
      </div>

      {selected && data.executionMode !== 'input' ? (
        <NodeComposer
          value={data.composer.prompt}
          attachments={data.composer.attachments}
          kind={data.kind}
          model={data.composer.model}
          generationConfig={data.composer.generationConfig}
          placeholder={data.promptPlaceholder}
          onValueChange={(prompt) => updateComposer(id, { prompt })}
          onFilesSelected={async (files) => {
            for (const file of files) {
              const asset = await uploadAsset(file, workflowId)
              const reference = {
                id: asset.id,
                kind: asset.kind === 'video' ? 'video' : asset.kind === 'image' ? 'image' : 'file',
                url: asset.url,
                name: asset.fileName,
                mimeType: asset.mimeType,
              } as const
              addAttachment(id, reference)
              await createResourceBinding({
                resourceId: asset.id,
                workflowId,
                nodeId: id,
                relation: 'attachment',
              })
            }
            await queryClient.invalidateQueries({ queryKey: ['resources'] })
          }}
          onModelChange={(model, generationConfig) => {
            updateComposer(id, { model, generationConfig })
          }}
          onGenerationConfigChange={(generationConfig) => {
            updateComposer(id, { generationConfig })
          }}
          onSubmit={submit}
          executionStatus={runStatus}
          onCancel={() => {
            if (data.latestRunId) cancelRun(data.latestRunId)
          }}
        />
      ) : selected && data.workflowInput ? (
        <div className="nodrag mt-2 w-[520px] rounded-xl border bg-background px-4 py-3 text-xs text-muted-foreground shadow-sm">
          运行时输入：<code className="text-foreground">{data.workflowInput.key}</code>
          {' · '}
          {data.workflowInput.valueType}
          {data.workflowInput.required ? ' · 必填' : ' · 可选'}
        </div>
      ) : null}
    </article>
  )
}

function getCopyableContent(
  result: WorkflowFlowNode['data']['results'][number] | undefined,
  streamingText: string,
) {
  if (streamingText) return streamingText
  if (result?.type === 'text') return result.text
  if (result?.type === 'image') return result.images[0]?.url
  if (result?.type === 'video') return result.video.url
  return undefined
}

function NodePreview({
  kind,
  result,
  streamingText,
  partialImage,
  error,
}: {
  kind: WorkflowNodeKind
  result?: WorkflowFlowNode['data']['results'][number]
  streamingText?: string
  partialImage?: string
  error?: string
}) {
  if (error) {
    return (
      <div className="flex h-[220px] items-center px-5 text-sm leading-6 text-destructive">
        {error}
      </div>
    )
  }
  if (streamingText) {
    return (
      <div className="h-[220px] overflow-auto whitespace-pre-wrap px-5 py-4 text-sm leading-6">
        {streamingText}
      </div>
    )
  }
  if (partialImage) {
    return <img className="h-[220px] w-full object-cover" src={partialImage} alt="生成预览" />
  }
  if (result?.type === 'text') {
    return (
      <div className="h-[220px] overflow-auto whitespace-pre-wrap px-5 py-4 text-sm leading-6">
        {result.text}
      </div>
    )
  }
  if (result?.type === 'image' && result.images[0]) {
    return (
      <img
        className="h-[220px] w-full object-cover"
        src={result.images[0].url}
        alt={result.images[0].name ?? '节点生成图片'}
      />
    )
  }
  if (result?.type === 'video') {
    return (
      <video className="h-[220px] w-full bg-black object-contain" src={result.video.url} controls />
    )
  }
  if (kind === 'text') {
    return (
      <div className="flex h-[220px] items-center px-5 text-sm leading-6 text-muted-foreground">
        文本结果将在这里生成
      </div>
    )
  }

  const Icon = kind === 'image' ? Image : Video
  return (
    <div className="grid h-[220px] place-items-center bg-muted/30 text-muted-foreground">
      <div className="flex flex-col items-center gap-1.5 text-[11px]">
        <Icon size={26} strokeWidth={1.4} />
        {kind === 'image' ? '等待生成图片' : '等待生成视频'}
      </div>
    </div>
  )
}
