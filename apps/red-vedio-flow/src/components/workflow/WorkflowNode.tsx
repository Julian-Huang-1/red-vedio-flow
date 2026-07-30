import { Handle, Position, type NodeProps } from '@xyflow/react'
import { FileText, Image, Video } from 'lucide-react'
import { useTaskStore } from '@/stores/taskStore'
import { useWorkflowStore } from '@/stores/workflowStore'
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
  const presentation = nodePresentation[data.kind]
  const Icon = presentation.icon
  const updateComposer = useWorkflowStore((state) => state.updateComposer)
  const addAttachment = useWorkflowStore((state) => state.addAttachment)
  const buildRunInput = useWorkflowStore((state) => state.buildRunInput)
  const workflowId = useWorkflowStore((state) => state.workflowId)
  const setLatestRun = useWorkflowStore((state) => state.setLatestRun)
  const createRun = useTaskStore((state) => state.createRun)
  const runStatus = useTaskStore((state) => (
    data.latestRunId ? state.runs[data.latestRunId]?.status : undefined
  ))
  const currentResult = data.results.find((result) => result.id === data.currentResultId)

  const submit = () => {
    debugger
    if (!data.composer.prompt.trim()) return
    const run = createRun(workflowId, id, buildRunInput(id))
    setLatestRun(id, run.id)
  }

  return (
    <article
      className="group relative w-[520px] text-card-foreground"
      data-workflow-node=""
      data-kind={data.kind}
      data-selected={selected ? '' : undefined}
      data-execution-state={runStatus ?? 'idle'}
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
              {presentation.label}
            </span>
          </header>
          <NodePreview kind={data.kind} result={currentResult} />
        </div>
        <Handle
          type="source"
          position={Position.Right}
          className="!size-2.5 !border-2 !border-background !bg-foreground"
        />
      </div>

      {selected ? (
        <NodeComposer
          value={data.composer.prompt}
          attachments={data.composer.attachments}
          kind={data.kind}
          model={data.composer.model}
          generationConfig={data.composer.generationConfig}
          placeholder={data.promptPlaceholder}
          onValueChange={(prompt) => updateComposer(id, { prompt })}
          onAttachment={(attachment) => addAttachment(id, attachment)}
          onModelChange={(model, generationConfig) => {
            updateComposer(id, { model, generationConfig })
          }}
          onGenerationConfigChange={(generationConfig) => {
            updateComposer(id, { generationConfig })
          }}
          onSubmit={submit}
        />
      ) : null}
    </article>
  )
}

function NodePreview({
  kind,
  result,
}: {
  kind: WorkflowNodeKind
  result?: WorkflowFlowNode['data']['results'][number]
}) {
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
