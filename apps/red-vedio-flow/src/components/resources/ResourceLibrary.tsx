import { useState } from 'react'
import { AudioLines, Check, File, FileText, Image, LoaderCircle, Play, Plus, Trash2, Video, Workflow, X } from 'lucide-react'
import type { Resource, ResourceKind } from '@red-video-flow/workflow-core'
import { createResourceBinding } from '@red-video-flow/workflow-client'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { useAgentBoxStore } from '@/components/agent-box/agentBoxStore'
import { resolveAgentResourceUrl } from '@/components/agent-box/resourceUrl'
import { cn } from '@/lib/utils'
import { useResourceLibraryStore } from '@/stores/resourceLibraryStore'
import { useWorkflowStore } from '@/stores/workflowStore'
import {
  useDeleteResourceMutation,
  useResourcesQuery,
} from './resourceQueries'

const kinds: Array<{
  value?: ResourceKind
  label: string
  icon?: typeof Image
}> = [
  { label: '全部' },
  { value: 'image', label: '图片', icon: Image },
  { value: 'video', label: '视频', icon: Video },
  { value: 'audio', label: '音频', icon: AudioLines },
  { value: 'text', label: '文本', icon: FileText },
  { value: 'file', label: '文件', icon: File },
  { value: 'workflow', label: '工作流', icon: Workflow },
]

const scopes = [
  { value: 'all', label: '全部' },
  { value: 'workspace', label: '当前工作区' },
] as const

export function ResourceLibrary({
  className,
  variant = 'workflow',
}: {
  className?: string
  variant?: 'workflow' | 'agent'
} = {}) {
  const open = useResourceLibraryStore((state) => state.open)
  const closeLibrary = useResourceLibraryStore((state) => state.closeLibrary)
  const scope = useResourceLibraryStore((state) => state.scope)
  const setScope = useResourceLibraryStore((state) => state.setScope)
  const kind = useResourceLibraryStore((state) => state.kind)
  const setKind = useResourceLibraryStore((state) => state.setKind)
  const query = useResourceLibraryStore((state) => state.query)
  const setQuery = useResourceLibraryStore((state) => state.setQuery)
  const addTarget = useResourceLibraryStore((state) => state.addTarget)
  const pendingResources = useAgentBoxStore((state) => state.pendingResources)
  const addAgentResource = useAgentBoxStore((state) => state.addResource)
  const removeAgentResource = useAgentBoxStore((state) => state.removeResource)
  const workflowId = useWorkflowStore((state) => state.workflowId)
  const selectedNodeId = useWorkflowStore((state) => state.selectedNodeId)
  const addAttachment = useWorkflowStore((state) => state.addAttachment)
  const updateComposer = useWorkflowStore((state) => state.updateComposer)
  const appendResult = useWorkflowStore((state) => state.appendResult)
  const setLatestRun = useWorkflowStore((state) => state.setLatestRun)
  const setNodeStatus = useWorkflowStore((state) => state.setNodeStatus)
  const resourcesQuery = useResourcesQuery({
    workspaceId: scope === 'workspace' ? workflowId : undefined,
    kind,
    query,
  })
  const deleteMutation = useDeleteResourceMutation(workflowId)

  const agentTarget = addTarget?.type === 'agent-resource'
  if (!open || (variant === 'agent') !== agentTarget) return null

  const nodeAddTarget = addTarget && addTarget.type !== 'agent-resource' ? addTarget : undefined
  const target = selectedNodeId && nodeAddTarget?.nodeId === selectedNodeId
    ? nodeAddTarget
    : selectedNodeId
      ? { nodeId: selectedNodeId, type: 'node-result' as const }
      : undefined
  const targetNode = target
    ? useWorkflowStore.getState().nodes.find((node) => node.id === target.nodeId)
    : undefined

  async function addResource(resource: Resource) {
    if (agentTarget) {
      const id = `canvas-resource-${resource.id}`
      const selected = pendingResources.some((item) => item.resourceId === resource.id)
      if (selected) {
        removeAgentResource(id)
      } else {
        addAgentResource({
          id,
          resourceId: resource.id,
          kind: resource.kind,
          name: resource.name,
          mimeType: resource.mimeType || defaultMimeType(resource.kind),
          size: resource.size ?? 0,
          url: resource.url,
          text: resource.text,
          thumbnailUrl: resource.thumbnailUrl,
          duration: resource.duration,
        })
      }
      return
    }
    if (!target || !targetNode) return
    if (target.type === 'node-result') {
      if (!canUseAsNodeResult(resource, targetNode.data.kind)) return
      const timestamp = Date.now()
      const resultId = `resource-result-${resource.id}-${timestamp}`
      const runId = `resource-${resource.id}-${timestamp}`
      if (resource.kind === 'text') {
        appendResult(target.nodeId, {
          id: resultId,
          runId,
          type: 'text',
          text: resource.text ?? '',
          resourceId: resource.id,
          provider: { providerId: 'resource-library' },
          createdAt: timestamp,
        })
      } else if (resource.kind === 'image') {
        appendResult(target.nodeId, {
          id: resultId,
          runId,
          type: 'image',
          images: [{
            id: resource.id,
            kind: 'image',
            url: resource.url!,
            name: resource.name,
            mimeType: resource.mimeType,
            width: resource.width,
            height: resource.height,
          }],
          provider: { providerId: 'resource-library' },
          createdAt: timestamp,
        })
      } else if (resource.kind === 'video') {
        appendResult(target.nodeId, {
          id: resultId,
          runId,
          type: 'video',
          video: {
            id: resource.id,
            kind: 'video',
            url: resource.url!,
            name: resource.name,
            mimeType: resource.mimeType,
            width: resource.width,
            height: resource.height,
            duration: resource.duration,
          },
          provider: { providerId: 'resource-library' },
          createdAt: timestamp,
        })
      } else if (resource.kind === 'audio') {
        appendResult(target.nodeId, {
          id: resultId,
          runId,
          type: 'audio',
          audio: {
            id: resource.id,
            kind: 'audio',
            url: resource.url!,
            name: resource.name,
            mimeType: resource.mimeType,
            duration: resource.duration,
          },
          provider: { providerId: 'resource-library' },
          createdAt: timestamp,
        })
      }
      setLatestRun(target.nodeId, undefined)
      setNodeStatus(target.nodeId, 'done')
      await createResourceBinding({
        resourceId: resource.id,
        workflowId,
        nodeId: target.nodeId,
        runId,
        resultId,
        relation: 'node-content',
      })
      return
    }

    const nodeId = target.nodeId
    if (!selectedNodeId) return
    if (resource.kind === 'text' && resource.text) {
      const node = useWorkflowStore.getState().nodes.find((item) => item.id === nodeId)
      const previous = node?.data.composer.prompt.trim()
      updateComposer(nodeId, {
        prompt: previous ? `${previous}\n\n${resource.text}` : resource.text,
      })
    } else if (resource.url) {
      addAttachment(nodeId, {
        id: resource.id,
        kind: resource.kind === 'image' || resource.kind === 'video' || resource.kind === 'audio' ? resource.kind : 'file',
        url: resource.url,
        name: resource.name,
        mimeType: resource.mimeType,
        width: resource.width,
        height: resource.height,
        duration: resource.duration,
      })
    }
    await createResourceBinding({
      resourceId: resource.id,
      workflowId,
      nodeId,
      relation: 'attachment',
    })
  }

  return (
    <aside
      className={cn(
        'fixed inset-y-0 right-0 z-30 flex h-screen h-dvh w-full max-w-[440px] flex-col overflow-hidden rounded-2xl border bg-background shadow-xl',
        className,
      )}
      data-resource-library=""
      data-open=""
    >
      <header className="flex h-14 shrink-0 items-center justify-between border-b px-4">
        <div>
          <h2 className="text-sm font-semibold">资源库</h2>
        </div>
        <Button variant="ghost" size="icon" className="size-8" onClick={closeLibrary}>
          <X className="size-4" />
        </Button>
      </header>
      <div className="space-y-3 border-b p-3">
        <Input
          value={query}
          className="h-8"
          placeholder="搜索资源"
          onChange={(event) => setQuery(event.target.value)}
        />
        <div className="space-y-1.5">
          <div
            className="flex items-end gap-5 border-b px-1"
            role="tablist"
            aria-label="资源范围"
          >
            {scopes.map((item) => {
              const selected = scope === item.value
              return (
                <Button
                  key={item.value}
                  type="button"
                  role="tab"
                  variant="ghost"
                  size="sm"
                  className={`relative h-9 rounded-none px-1 text-sm hover:bg-transparent ${
                    selected
                      ? 'font-medium text-foreground after:absolute after:inset-x-0 after:-bottom-px after:h-0.5 after:rounded-full after:bg-foreground'
                      : 'font-normal text-muted-foreground hover:text-foreground'
                  }`}
                  aria-selected={selected}
                  onClick={() => setScope(item.value)}
                >
                  {item.label}
                </Button>
              )
            })}
          </div>
        </div>
        <div
          className="flex items-center gap-1"
          role="group"
          aria-label="资源类型"
        >
          {kinds.map((item) => {
            const Icon = item.icon
            const selected = kind === item.value
            return (
              <div key={item.value ?? 'all'} className="group/filter relative">
                <Button
                  type="button"
                  variant="ghost"
                  size={Icon ? 'icon' : 'sm'}
                  className={Icon
                    ? `size-8 rounded-md ${selected ? 'bg-muted text-foreground hover:bg-muted' : 'text-muted-foreground'}`
                    : `h-8 rounded-md px-3 text-xs ${selected ? 'bg-muted text-foreground hover:bg-muted' : 'text-muted-foreground'}`}
                  aria-label={item.label}
                  aria-pressed={selected}
                  title={item.label}
                  onClick={() => setKind(item.value)}
                >
                  {Icon ? <Icon className="size-4" /> : item.label}
                </Button>
                {Icon ? (
                  <span
                    role="tooltip"
                    className="pointer-events-none absolute left-1/2 top-full z-40 mt-1.5 -translate-x-1/2 whitespace-nowrap rounded-md bg-foreground px-2 py-1 text-[10px] text-background opacity-0 shadow-sm transition-opacity group-hover/filter:opacity-100 group-focus-within/filter:opacity-100"
                  >
                    {item.label}
                  </span>
                ) : null}
              </div>
            )
          })}
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        {resourcesQuery.isPending ? (
          <div className="grid h-40 place-items-center text-muted-foreground">
            <LoaderCircle className="size-5 animate-spin" />
          </div>
        ) : resourcesQuery.data?.resources.length ? (
          <div className="grid grid-cols-2 gap-2.5">
            {resourcesQuery.data.resources.map((resource) => (
              <ResourceCard
                key={resource.id}
                resource={resource}
                canAttach={agentTarget || canAddResource(resource, targetNode?.data.kind, target?.type)}
                selected={agentTarget && pendingResources.some((item) => item.resourceId === resource.id)}
                allowDelete={!agentTarget}
                attachDisabledReason={getAddDisabledReason(
                  resource,
                  targetNode?.data.kind,
                  target?.type,
                )}
                onAttach={() => void addResource(resource)}
                onDelete={() => deleteMutation.mutate(resource.id)}
              />
            ))}
          </div>
        ) : (
          <div className="grid h-48 place-items-center text-center text-xs text-muted-foreground">
            <div>
              <File className="mx-auto mb-2 size-7" strokeWidth={1.4} />
              暂无资源
            </div>
          </div>
        )}
      </div>
    </aside>
  )
}

function canUseAsNodeResult(
  resource: Resource,
  nodeKind: 'text' | 'image' | 'video' | 'audio',
) {
  if (resource.kind !== nodeKind) return false
  return resource.kind === 'text' ? resource.text !== undefined : Boolean(resource.url)
}

function canAddResource(
  resource: Resource,
  nodeKind?: 'text' | 'image' | 'video' | 'audio',
  targetType?: 'node-result' | 'composer-attachment',
) {
  if (!nodeKind || !targetType) return false
  if (targetType === 'node-result') return canUseAsNodeResult(resource, nodeKind)
  return resource.kind === 'text' ? Boolean(resource.text) : Boolean(resource.url)
}

function getAddDisabledReason(
  resource: Resource,
  nodeKind?: 'text' | 'image' | 'video' | 'audio',
  targetType?: 'node-result' | 'composer-attachment',
) {
  if (!nodeKind || !targetType) return '请先选择节点或 Composer'
  if (targetType === 'node-result' && resource.kind !== nodeKind) {
    const labels = { text: '文本', image: '图片', video: '视频', audio: '音频' }
    return `只能将${labels[nodeKind]}资源加入该节点的当前结果`
  }
  if (resource.kind === 'text' ? resource.text === undefined : !resource.url) {
    return '该资源没有可用内容'
  }
  return undefined
}

function ResourceCard({
  resource,
  canAttach,
  selected = false,
  allowDelete = true,
  attachDisabledReason,
  onAttach,
  onDelete,
}: {
  resource: Resource
  canAttach: boolean
  selected?: boolean
  allowDelete?: boolean
  attachDisabledReason?: string
  onAttach: () => void
  onDelete: () => void
}) {
  const [videoPreviewOpen, setVideoPreviewOpen] = useState(false)
  const videoUrl = resource.kind === 'video'
    ? resolveAgentResourceUrl(resource.url)
    : undefined

  return (
    <>
      <article
        className="group relative overflow-hidden rounded-lg border bg-card"
        data-resource-card=""
        data-kind={resource.kind}
        data-selected={selected ? '' : undefined}
      >
        {selected ? (
          <span
            className="absolute right-2 top-2 z-10 grid size-6 place-items-center rounded-full bg-primary text-primary-foreground shadow-sm"
            aria-label="已选择"
            data-resource-selected-indicator=""
          >
            <Check className="size-3.5" strokeWidth={3} />
          </span>
        ) : null}
        {videoUrl ? (
          <button
            type="button"
            className="relative block w-full cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            aria-label={`播放视频：${resource.name}`}
            onClick={() => setVideoPreviewOpen(true)}
          >
            <ResourcePreview resource={resource} />
            <span className="absolute inset-0 grid place-items-center bg-black/10 transition-colors group-hover:bg-black/25">
              <span className="grid size-9 place-items-center rounded-full bg-black/65 text-white shadow-lg">
                <Play className="ml-0.5 size-4 fill-current" />
              </span>
            </span>
          </button>
        ) : (
          <ResourcePreview resource={resource} />
        )}
        <div className="space-y-2 p-2">
          <div>
            <p className="truncate text-xs font-medium">{resource.name}</p>
            <p className="mt-0.5 text-[10px] text-muted-foreground">
              {resource.source === 'generated' ? '生成' : resource.source === 'upload' ? '上传' : '导入'}
            </p>
          </div>
          <div className="flex items-center justify-between">
            <Button
              size="sm"
              variant={selected ? 'default' : 'secondary'}
              className="h-6 gap-1 px-2 text-[10px]"
              disabled={!canAttach}
              title={attachDisabledReason}
              onClick={onAttach}
            >
              {selected ? <X className="size-3" /> : <Plus className="size-3" />}
              {selected ? '取消' : '选择'}
            </Button>
            {allowDelete ? (
              <Button
                size="icon"
                variant="ghost"
                className="size-6 text-muted-foreground hover:text-destructive"
                aria-label="删除资源"
                onClick={onDelete}
              >
                <Trash2 className="size-3" />
              </Button>
            ) : <span />}
          </div>
        </div>
      </article>
      {videoUrl ? (
        <Dialog open={videoPreviewOpen} onOpenChange={setVideoPreviewOpen}>
          <DialogContent className="w-[min(960px,calc(100vw-3rem))] max-w-none border-0 bg-black p-0 shadow-2xl sm:max-w-none">
            <DialogTitle className="sr-only">播放视频：{resource.name}</DialogTitle>
            <video
              className="max-h-[85vh] w-full bg-black object-contain"
              src={videoUrl}
              controls
              autoPlay
              playsInline
            />
          </DialogContent>
        </Dialog>
      ) : null}
    </>
  )
}

function defaultMimeType(kind: ResourceKind) {
  if (kind === 'text') return 'text/plain'
  if (kind === 'workflow') return 'application/vnd.red-video-flow.workflow+json'
  if (kind === 'image') return 'image/*'
  if (kind === 'video') return 'video/*'
  if (kind === 'audio') return 'audio/*'
  return 'application/octet-stream'
}

function ResourcePreview({ resource }: { resource: Resource }) {
  if (resource.kind === 'image' && resource.url) {
    return <img className="h-24 w-full bg-muted object-cover" src={resource.url} alt={resource.name} />
  }
  if (resource.kind === 'video' && resource.url) {
    return <video className="h-24 w-full bg-black object-cover" src={resource.url} muted preload="metadata" />
  }
  if (resource.kind === 'audio' && resource.url) {
    return <div className="flex h-24 items-center bg-muted/40 px-2"><audio className="w-full" src={resource.url} controls preload="metadata" /></div>
  }
  if (resource.kind === 'text') {
    return (
      <div className="h-24 overflow-hidden bg-muted/40 p-2 text-[10px] leading-4 text-muted-foreground">
        {resource.text}
      </div>
    )
  }
  const Icon = resource.kind === 'image'
      ? Image
      : resource.kind === 'video'
        ? Video
        : resource.kind === 'audio'
          ? AudioLines
        : resource.kind === 'workflow'
          ? Workflow
          : File
  return (
    <div className="grid h-24 place-items-center bg-muted/40 text-muted-foreground">
      <Icon className="size-7" strokeWidth={1.4} />
    </div>
  )
}
