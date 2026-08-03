import { useEffect, useRef, useState } from 'react'
import { Handle, Position, type NodeProps } from '@xyflow/react'
import { AudioLines, Bug, Check, Copy, FileText, Image, LoaderCircle, Pencil, TriangleAlert, Upload, Video, ZoomIn } from 'lucide-react'
import { useTaskStore } from '@/stores/taskStore'
import { useWorkflowStore } from '@/stores/workflowStore'
import { useResourceLibraryStore } from '@/stores/resourceLibraryStore'
import { createResourceBinding, uploadAsset } from '@red-video-flow/workflow-client'
import { queryClient } from '@/lib/queryClient'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import { NodeComposer } from './NodeComposer'
import { CapabilityLabelButton } from './CapabilityLabelButton'
import { NodeDebugDrawer } from './NodeDebugDrawer'
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
  audio: {
    icon: AudioLines,
    label: 'AUDIO',
  },
} satisfies Record<WorkflowNodeKind, {
  icon: typeof FileText
  label: string
}>

export function WorkflowNode({ id, data, selected }: NodeProps<WorkflowFlowNode>) {
  const [uploadingContent, setUploadingContent] = useState(false)
  const [uploadError, setUploadError] = useState<string>()
  const [editingText, setEditingText] = useState(false)
  const [textDraft, setTextDraft] = useState('')
  const [debugOpen, setDebugOpen] = useState(false)
  const [imagePreviewOpen, setImagePreviewOpen] = useState(false)
  const contentFileInputRef = useRef<HTMLInputElement>(null)
  const presentation = nodePresentation[data.kind]
  const Icon = presentation.icon
  const updateComposer = useWorkflowStore((state) => state.updateComposer)
  const addAttachment = useWorkflowStore((state) => state.addAttachment)
  const appendResult = useWorkflowStore((state) => state.appendResult)
  const setLatestRun = useWorkflowStore((state) => state.setLatestRun)
  const setNodeStatus = useWorkflowStore((state) => state.setNodeStatus)
  const duplicateNode = useWorkflowStore((state) => state.duplicateNode)
  const workflowId = useWorkflowStore((state) => state.workflowId)
  const capabilitySubgraph = useWorkflowStore((state) => (
    state.subgraphs.find((subgraph) => subgraph.nodeIds.includes(id))
  ))
  const toggleCapabilityLabel = useWorkflowStore((state) => state.toggleSubgraphCapabilityLabel)
  const nodeInputLabel = capabilitySubgraph?.capability?.inputs.some((item) => item.target.nodeId === id && item.target.kind === 'node') ?? false
  const nodeOutputLabel = capabilitySubgraph?.capability?.outputs.some((item) => item.target.nodeId === id && item.target.kind === 'node') ?? false
  const composerInputLabel = capabilitySubgraph?.capability?.inputs.some((item) => item.target.nodeId === id && item.target.kind === 'composer') ?? false
  const composerOutputLabel = capabilitySubgraph?.capability?.outputs.some((item) => item.target.nodeId === id && item.target.kind === 'composer') ?? false
  const setResourceAddTarget = useResourceLibraryStore((state) => state.setAddTarget)
  const submitNode = useTaskStore((state) => state.submitNode)
  const cancelRun = useTaskStore((state) => state.cancelRun)
  const runStatus = useTaskStore((state) => (
    data.latestRunId ? state.runs[data.latestRunId]?.status : undefined
  ))
  const streamingText = useTaskStore((state) => (
    data.latestRunId ? state.progress[data.latestRunId]?.text ?? '' : ''
  ))
  const runError = useTaskStore((state) => (
    data.latestRunId ? state.runs[data.latestRunId]?.error?.message : undefined
  ))
  const workflowNodeState = useTaskStore((state) => state.workflowRun?.nodeStates[id])
  const workflowValidationIssues = useTaskStore((state) => state.workflowValidationIssues)
  const validationIssues = workflowValidationIssues.filter((issue) => issue.nodeId === id)
  const currentResult = data.results.find((result) => result.id === data.currentResultId)
  const previewImage = currentResult?.type === 'image' && currentResult.images[0]
      ? {
          src: currentResult.images[0].url,
          alt: currentResult.images[0].name ?? '节点图片',
        }
      : undefined
  const statusTag = getNodeStatusTag({
    dataStatus: data.status,
    executionMode: data.executionMode,
    presentationLabel: presentation.label,
    runStatus,
    workflowStatus: workflowNodeState?.status,
  })

  const submit = () => {
    if (!data.composer.prompt.trim()) return
    void submitNode(id)
  }

  const uploadNodeContent = async (file: File) => {
    const expectedType = data.kind === 'image' ? 'image/' : data.kind === 'video' ? 'video/' : 'audio/'
    if (!file.type.startsWith(expectedType)) {
      setUploadError(data.kind === 'image' ? '请选择图片文件' : data.kind === 'video' ? '请选择视频文件' : '请选择音频文件')
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
      } else if (data.kind === 'video') {
        appendResult(id, {
          id: resultId,
          runId,
          type: 'video',
          video: { ...reference, kind: 'video' },
          provider: { providerId: 'upload' },
          createdAt: Date.now(),
        })
      } else {
        appendResult(id, {
          id: resultId,
          runId,
          type: 'audio',
          audio: { ...reference, kind: 'audio' },
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
      setLatestRun(id, undefined)
      setNodeStatus(id, 'done')
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
      data-validation-error={validationIssues.length ? '' : undefined}
    >
      <div
        className="relative mx-auto w-[360px]"
        data-workflow-node-card=""
        onPointerDownCapture={() => {
          setResourceAddTarget({ nodeId: id, type: 'node-result' })
        }}
      >
        <Handle
          type="target"
          position={Position.Left}
          className="!size-2.5 !border-2 !border-background !bg-foreground"
        />
        <div className="overflow-hidden rounded-xl border bg-card shadow-sm transition-[border-color,box-shadow] group-data-[selected]:border-foreground/40 group-data-[selected]:shadow-md group-data-[validation-error]:border-destructive/40">
          <header
            className="flex h-9 items-center gap-2 border-b px-3"
            data-workflow-node-header=""
          >
            <Icon size={14} className="text-muted-foreground" />
            <h2 className="min-w-0 flex-1 truncate text-[13px] font-medium">{data.title}</h2>
            <span
              className={`rounded-full px-2 py-0.5 text-[9px] font-medium tracking-wider ${statusTag.className}`}
              data-workflow-node-status-tag=""
              data-status={statusTag.status}
            >
              {statusTag.label}
            </span>
            {data.kind === 'image' || data.kind === 'video' || data.kind === 'audio' ? (
              <>
                <input
                  ref={contentFileInputRef}
                  type="file"
                  className="hidden"
                  accept={data.kind === 'image' ? 'image/*' : data.kind === 'video' ? 'video/*' : 'audio/*'}
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
                  aria-label={data.kind === 'image' ? '上传并覆盖节点图片' : data.kind === 'video' ? '上传并覆盖节点视频' : '上传并覆盖节点音频'}
                  title={data.kind === 'image' ? '上传图片到节点' : data.kind === 'video' ? '上传视频到节点' : '上传音频到节点'}
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
                {data.kind === 'image' ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="nodrag nopan size-7 text-muted-foreground hover:text-foreground"
                    aria-label="查看图片大图"
                    title={previewImage ? '查看图片大图' : '暂无可预览图片'}
                    disabled={!previewImage}
                    data-workflow-node-image-preview=""
                    onPointerDown={(event) => event.stopPropagation()}
                    onClick={(event) => {
                      event.stopPropagation()
                      setImagePreviewOpen(true)
                    }}
                  >
                    <ZoomIn className="size-3.5" />
                  </Button>
                ) : null}
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
              className="nodrag nopan size-7 text-muted-foreground hover:text-foreground"
              aria-label="查看节点 Debug"
              title={data.latestRunId ? '查看节点 Debug' : '运行节点后可查看 Debug'}
              disabled={!data.latestRunId}
              data-workflow-node-debug=""
              onPointerDown={(event) => event.stopPropagation()}
              onClick={(event) => {
                event.stopPropagation()
                setDebugOpen(true)
              }}
            >
              <Bug className="size-3.5" />
            </Button>
            {capabilitySubgraph ? (
              <>
                <CapabilityLabelButton
                  direction="input"
                  target="node"
                  active={nodeInputLabel}
                  onClick={() => toggleCapabilityLabel(capabilitySubgraph.id, id, 'node', 'input', data.kind)}
                />
                <CapabilityLabelButton
                  direction="output"
                  target="node"
                  active={nodeOutputLabel}
                  onClick={() => toggleCapabilityLabel(capabilitySubgraph.id, id, 'node', 'output', data.kind)}
                />
              </>
            ) : null}
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="nodrag nopan -mr-1 size-7 text-muted-foreground hover:text-foreground"
              aria-label="复制卡片"
              title="复制完整卡片"
              data-workflow-node-copy=""
              onPointerDown={(event) => event.stopPropagation()}
              onClick={(event) => {
                event.stopPropagation()
                duplicateNode(id)
              }}
            >
              <Copy className="size-3.5" />
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
            <>
              <NodePreview
                kind={data.kind}
                result={currentResult}
                streamingText={streamingText}
                error={uploadError ?? (
                  data.status === 'error'
                    ? runError ?? workflowNodeState?.error
                    : undefined
                )}
              />
              {validationIssues.length ? (
                <div
                  className="flex items-start gap-1.5 border-t border-destructive/20 bg-destructive/5 px-3 py-2 text-xs leading-5 text-destructive"
                  data-workflow-node-validation=""
                >
                  <TriangleAlert className="mt-0.5 size-3.5 shrink-0" />
                  <span>
                    {validationIssues[0].message}
                    {validationIssues.length > 1
                      ? `，另有 ${validationIssues.length - 1} 个问题`
                      : ''}
                  </span>
                </div>
              ) : null}
            </>
          )}
        </div>
        <Handle
          type="source"
          position={Position.Right}
          className="!size-2.5 !border-2 !border-background !bg-foreground"
        />
      </div>

      {selected && data.executionMode !== 'input' && data.kind !== 'audio' ? (
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
          onAttachmentRemove={(attachmentId) => {
            updateComposer(id, {
              attachments: data.composer.attachments.filter(
                (attachment) => attachment.id !== attachmentId,
              ),
            })
          }}
          onFocusTarget={() => {
            setResourceAddTarget({ nodeId: id, type: 'composer-attachment' })
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
          capabilityLabels={capabilitySubgraph ? {
            input: composerInputLabel,
            output: composerOutputLabel,
          } : undefined}
          onCapabilityLabelToggle={(direction) => {
            if (capabilitySubgraph) toggleCapabilityLabel(capabilitySubgraph.id, id, 'composer', direction, data.kind)
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
      <NodeDebugDrawer
        open={debugOpen}
        runId={data.latestRunId}
        nodeTitle={data.title}
        onOpenChange={setDebugOpen}
      />
      {previewImage ? (
        <Dialog open={imagePreviewOpen} onOpenChange={setImagePreviewOpen}>
          <DialogContent
            className="w-auto max-w-[calc(100vw-3rem)] border-0 bg-transparent p-0 shadow-none sm:max-w-[calc(100vw-3rem)]"
            onPointerDown={(event) => event.stopPropagation()}
          >
            <DialogTitle className="sr-only">图片大图预览</DialogTitle>
            <img
              className="max-h-[90vh] max-w-[calc(100vw-3rem)] object-contain shadow-2xl"
              src={previewImage.src}
              alt={previewImage.alt}
            />
          </DialogContent>
        </Dialog>
      ) : null}
    </article>
  )
}

function getNodeStatusTag({
  dataStatus,
  executionMode,
  presentationLabel,
  runStatus,
  workflowStatus,
}: {
  dataStatus: WorkflowFlowNode['data']['status']
  executionMode?: WorkflowFlowNode['data']['executionMode']
  presentationLabel: string
  runStatus?: string
  workflowStatus?: string
}) {
  if (runStatus === 'queued') {
    return {
      status: 'queued',
      label: 'QUEUED',
      className: 'bg-amber-500/10 text-amber-700 dark:text-amber-400',
    }
  }
  if (runStatus === 'running' || workflowStatus === 'running' || dataStatus === 'running') {
    return {
      status: 'running',
      label: 'RUNNING',
      className: 'bg-blue-500/10 text-blue-700 dark:text-blue-400',
    }
  }
  if (runStatus === 'failed' || workflowStatus === 'failed' || dataStatus === 'error') {
    return {
      status: 'error',
      label: 'ERROR',
      className: 'bg-destructive/10 text-destructive',
    }
  }
  if (runStatus === 'cancelled' || workflowStatus === 'cancelled') {
    return {
      status: 'cancelled',
      label: 'CANCELLED',
      className: 'bg-slate-500/10 text-slate-600 dark:text-slate-400',
    }
  }
  if (workflowStatus === 'skipped') {
    return {
      status: 'skipped',
      label: 'SKIPPED',
      className: 'bg-slate-500/10 text-slate-600 dark:text-slate-400',
    }
  }
  if (runStatus === 'succeeded' || workflowStatus === 'succeeded' || dataStatus === 'done') {
    return {
      status: 'done',
      label: 'DONE',
      className: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400',
    }
  }
  if (executionMode === 'input') {
    return {
      status: 'input',
      label: 'INPUT',
      className: 'bg-violet-500/10 text-violet-700 dark:text-violet-400',
    }
  }
  return {
    status: dataStatus,
    label: presentationLabel,
    className: 'bg-muted text-muted-foreground',
  }
}

function NodePreview({
  kind,
  result,
  streamingText,
  error,
}: {
  kind: WorkflowNodeKind
  result?: WorkflowFlowNode['data']['results'][number]
  streamingText?: string
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
  if (result?.type === 'text') {
    return (
      <div className="h-[220px] overflow-auto whitespace-pre-wrap px-5 py-4 text-sm leading-6">
        {result.text}
      </div>
    )
  }
  if (result?.type === 'image' && result.images[0]) {
    const image = result.images[0]
    const alt = image.name ?? '节点生成图片'
    return (
      <img
        className="h-[220px] w-full bg-muted/30 object-contain"
        src={image.url}
        alt={alt}
      />
    )
  }
  if (result?.type === 'video') {
    return (
      <video className="h-[220px] w-full bg-black object-contain" src={result.video.url} controls />
    )
  }
  if (result?.type === 'audio') {
    return (
      <div className="flex h-[220px] items-center bg-muted/30 px-5">
        <audio className="w-full" src={result.audio.url} controls preload="metadata" />
      </div>
    )
  }
  if (kind === 'text') {
    return (
      <div className="flex h-[220px] items-center px-5 text-sm leading-6 text-muted-foreground">
        文本结果将在这里生成
      </div>
    )
  }

  const Icon = kind === 'image' ? Image : kind === 'video' ? Video : AudioLines
  return (
    <div className="grid h-[220px] place-items-center bg-muted/30 text-muted-foreground">
      <div className="flex flex-col items-center gap-1.5 text-[11px]">
        <Icon size={26} strokeWidth={1.4} />
        {kind === 'image' ? '等待生成图片' : kind === 'video' ? '等待生成视频' : '请上传音频'}
      </div>
    </div>
  )
}
