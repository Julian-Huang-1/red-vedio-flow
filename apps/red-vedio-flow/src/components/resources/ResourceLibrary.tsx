import { File, Image, LoaderCircle, Plus, Trash2, Video, X } from 'lucide-react'
import type { Resource, ResourceKind } from '@red-video-flow/workflow-core'
import { createResourceBinding } from '@red-video-flow/workflow-client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useResourceLibraryStore } from '@/stores/resourceLibraryStore'
import { useWorkflowStore } from '@/stores/workflowStore'
import {
  useDeleteResourceMutation,
  useResourcesQuery,
} from './resourceQueries'

const kinds: Array<{ value?: ResourceKind; label: string }> = [
  { label: '全部' },
  { value: 'image', label: '图片' },
  { value: 'video', label: '视频' },
  { value: 'text', label: '文本' },
  { value: 'file', label: '文件' },
]

export function ResourceLibrary() {
  const open = useResourceLibraryStore((state) => state.open)
  const closeLibrary = useResourceLibraryStore((state) => state.closeLibrary)
  const kind = useResourceLibraryStore((state) => state.kind)
  const setKind = useResourceLibraryStore((state) => state.setKind)
  const query = useResourceLibraryStore((state) => state.query)
  const setQuery = useResourceLibraryStore((state) => state.setQuery)
  const workflowId = useWorkflowStore((state) => state.workflowId)
  const selectedNodeId = useWorkflowStore((state) => state.selectedNodeId)
  const addAttachment = useWorkflowStore((state) => state.addAttachment)
  const updateComposer = useWorkflowStore((state) => state.updateComposer)
  const resourcesQuery = useResourcesQuery({ workspaceId: workflowId, kind, query })
  const deleteMutation = useDeleteResourceMutation(workflowId)

  if (!open) return null

  async function addToComposer(resource: Resource) {
    if (!selectedNodeId) return
    if (resource.kind === 'text' && resource.text) {
      const node = useWorkflowStore.getState().nodes.find((item) => item.id === selectedNodeId)
      const previous = node?.data.composer.prompt.trim()
      updateComposer(selectedNodeId, {
        prompt: previous ? `${previous}\n\n${resource.text}` : resource.text,
      })
    } else if (resource.url) {
      addAttachment(selectedNodeId, {
        id: resource.id,
        kind: resource.kind === 'image' || resource.kind === 'video' ? resource.kind : 'file',
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
      nodeId: selectedNodeId,
      relation: 'attachment',
    })
  }

  return (
    <aside
      className="absolute inset-y-0 right-0 z-30 flex w-[380px] flex-col border-l bg-background shadow-xl"
      data-resource-library=""
      data-open=""
    >
      <header className="flex h-14 shrink-0 items-center justify-between border-b px-4">
        <div>
          <h2 className="text-sm font-semibold">资源库</h2>
          <p className="text-[11px] text-muted-foreground">当前画布的上传与生成素材</p>
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
        <div className="flex flex-wrap gap-1">
          {kinds.map((item) => (
            <Button
              key={item.value ?? 'all'}
              variant={kind === item.value ? 'secondary' : 'ghost'}
              size="sm"
              className="h-7 px-2.5 text-xs"
              onClick={() => setKind(item.value)}
            >
              {item.label}
            </Button>
          ))}
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
                canAttach={Boolean(selectedNodeId)}
                onAttach={() => void addToComposer(resource)}
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

function ResourceCard({
  resource,
  canAttach,
  onAttach,
  onDelete,
}: {
  resource: Resource
  canAttach: boolean
  onAttach: () => void
  onDelete: () => void
}) {
  return (
    <article
      className="group overflow-hidden rounded-lg border bg-card"
      data-resource-card=""
      data-kind={resource.kind}
    >
      <ResourcePreview resource={resource} />
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
            variant="secondary"
            className="h-6 gap-1 px-2 text-[10px]"
            disabled={!canAttach}
            onClick={onAttach}
          >
            <Plus className="size-3" />
            加入
          </Button>
          <Button
            size="icon"
            variant="ghost"
            className="size-6 text-muted-foreground hover:text-destructive"
            aria-label="删除资源"
            onClick={onDelete}
          >
            <Trash2 className="size-3" />
          </Button>
        </div>
      </div>
    </article>
  )
}

function ResourcePreview({ resource }: { resource: Resource }) {
  if (resource.kind === 'image' && resource.url) {
    return <img className="h-24 w-full bg-muted object-cover" src={resource.url} alt={resource.name} />
  }
  if (resource.kind === 'video' && resource.url) {
    return <video className="h-24 w-full bg-black object-cover" src={resource.url} muted preload="metadata" />
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
        : File
  return (
    <div className="grid h-24 place-items-center bg-muted/40 text-muted-foreground">
      <Icon className="size-7" strokeWidth={1.4} />
    </div>
  )
}
