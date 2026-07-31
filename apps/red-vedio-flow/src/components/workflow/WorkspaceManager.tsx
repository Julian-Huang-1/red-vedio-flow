import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Library, LoaderCircle, Pencil, Plus } from 'lucide-react'
import {
  createWorkflow,
  fetchWorkflow,
  fetchWorkflows,
} from '@red-video-flow/workflow-client'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useWorkflowStore } from '@/stores/workflowStore'
import { useWorkspaceStore } from '@/stores/workspaceStore'
import { useResourceLibraryStore } from '@/stores/resourceLibraryStore'
import { useTaskStore } from '@/stores/taskStore'
import { persistCurrentWorkflow } from '@/lib/workflowPersistence'

export function WorkspaceManager() {
  const queryClient = useQueryClient()
  const currentWorkspaceId = useWorkspaceStore((state) => state.currentWorkspaceId)
  const openWorkspace = useWorkspaceStore((state) => state.openWorkspace)
  const setWorkspaces = useWorkspaceStore((state) => state.setWorkspaces)
  const loadWorkflow = useWorkflowStore((state) => state.loadWorkflow)
  const workflowTitle = useWorkflowStore((state) => state.workflowTitle)
  const setWorkflowTitle = useWorkflowStore((state) => state.setWorkflowTitle)
  const [switching, setSwitching] = useState(false)
  const [scope, setScope] = useState<'mine' | 'all'>('mine')
  const openLibrary = useResourceLibraryStore((state) => state.openLibrary)
  const restoreWorkflowRuns = useTaskStore((state) => state.restoreWorkflowRuns)

  const workflowsQuery = useQuery({
    queryKey: ['workflows', scope],
    queryFn: () => fetchWorkflows(scope),
  })
  const workflowQuery = useQuery({
    queryKey: ['workflow', currentWorkspaceId],
    queryFn: () => fetchWorkflow(currentWorkspaceId),
    enabled: Boolean(currentWorkspaceId),
  })
  const createMutation = useMutation({
    mutationFn: async (nextTitle: string) => {
      await persistCurrentWorkflow()
      return createWorkflow({ title: nextTitle })
    },
    onSuccess: async (workflow) => {
      queryClient.setQueryData(['workflow', workflow.id], workflow)
      await queryClient.invalidateQueries({ queryKey: ['workflows'] })
      openWorkspace(workflow.id)
    },
  })

  useEffect(() => {
    const workflows = workflowsQuery.data?.workflows ?? []
    setWorkspaces(workflows.map((workflow) => ({
      id: workflow.id,
      title: workflow.title,
      createdAt: workflow.createdAt,
      updatedAt: workflow.updatedAt,
    })))
    const currentExists = workflows.some((workflow) => workflow.id === currentWorkspaceId)
    if (!currentExists && workflowsQuery.data) openWorkspace(workflows[0]?.id)
  }, [currentWorkspaceId, openWorkspace, setWorkspaces, workflowsQuery.data])

  useEffect(() => {
    if (workflowQuery.data) {
      loadWorkflow(workflowQuery.data)
      void restoreWorkflowRuns(workflowQuery.data.id)
    }
  }, [loadWorkflow, restoreWorkflowRuns, workflowQuery.data])

  async function switchWorkspace(workflowId: string) {
    if (workflowId === currentWorkspaceId) return
    setSwitching(true)
    try {
      await persistCurrentWorkflow()
      openWorkspace(workflowId)
    } finally {
      setSwitching(false)
    }
  }

  async function renameCurrentWorkspace() {
    if (!currentWorkspaceId) return
    const nextTitle = window.prompt('重命名画布', workflowTitle)?.trim()
    if (!nextTitle || nextTitle === workflowTitle) return
    setWorkflowTitle(nextTitle)
    await persistCurrentWorkflow()
    await queryClient.invalidateQueries({ queryKey: ['workflows'] })
    await queryClient.invalidateQueries({ queryKey: ['workflow', currentWorkspaceId] })
  }

  const workflows = workflowsQuery.data?.workflows ?? []
  const loading = workflowsQuery.isPending || workflowQuery.isFetching || switching

  return (
    <div
      className="flex items-center gap-0.5 rounded-lg border bg-background/95 p-0.5 shadow-sm backdrop-blur"
      data-workspace-manager=""
      data-loading={loading ? '' : undefined}
    >
      <>
          <Select value={scope} onValueChange={(value) => setScope(value as 'mine' | 'all')}>
            <SelectTrigger className="h-7 w-[72px] border-0 bg-transparent px-2 text-xs shadow-none">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="mine">自己</SelectItem>
              <SelectItem value="all">全部</SelectItem>
            </SelectContent>
          </Select>
          <Select
            value={currentWorkspaceId}
            disabled={loading || workflows.length === 0}
            onValueChange={(value) => void switchWorkspace(value)}
          >
            <SelectTrigger className="h-7 w-40 border-0 bg-transparent px-2 text-xs shadow-none">
              <SelectValue placeholder={workflowsQuery.isPending ? '正在加载画布…' : '选择画布'} />
            </SelectTrigger>
            <SelectContent>
              {workflows.map((workflow) => (
                <SelectItem key={workflow.id} value={workflow.id}>
                  {workflow.title}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            variant="ghost"
            size="icon"
            className="size-7"
            title="重命名画布"
            aria-label="重命名画布"
            disabled={loading || !currentWorkspaceId}
            onClick={() => void renameCurrentWorkspace()}
          >
            <Pencil className="size-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="size-7"
            title="新建画布"
            aria-label="新建画布"
            disabled={createMutation.isPending}
            onClick={() => createMutation.mutate('未命名')}
          >
            {createMutation.isPending
              ? <LoaderCircle className="size-3.5 animate-spin" />
              : <Plus className="size-3.5" />}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="size-7"
            title="资源库"
            aria-label="资源库"
            onClick={openLibrary}
          >
            <Library className="size-3.5" />
          </Button>
          {loading ? <LoaderCircle className="mx-1 size-3.5 animate-spin text-muted-foreground" /> : null}
        </>
    </div>
  )
}

export function useWorkflowAutosave() {
  const workflowId = useWorkflowStore((state) => state.workflowId)
  const changeVersion = useWorkflowStore((state) => state.changeVersion)

  useEffect(() => {
    if (!changeVersion) return
    const timer = window.setTimeout(() => {
      void persistCurrentWorkflow().catch((error) => {
        console.error('自动保存画布失败', error)
      })
    }, 700)
    return () => window.clearTimeout(timer)
  }, [changeVersion, workflowId])
}
