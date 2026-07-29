import { useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { useEffect, useMemo, useRef, useState } from 'react'
import { fetchWorkflow } from '@red-video-flow/workflow-client'
import {
  useAgentsQuery,
  useCreateWorkflowMutation,
  useDeleteWorkflowMutation,
  useWorkflowListQuery,
  workflowQueryKeys,
} from '../../queries/workflowQueries'
import { useAgentCatalogStore } from '../../state/agentCatalogStore'
import { useCanvasUiStore } from '../../state/canvasUiStore'
import { useWorkflowStore } from '../../store/workflowStore'

export function useTopBar() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const agents = useAgentCatalogStore((state) => state.agents)
  const workflowId = useWorkflowStore((state) => state.workflowId)
  const workflowTitle = useWorkflowStore((state) => state.workflowTitle)
  const workflows = useWorkflowStore((state) => state.workflows)
  const workflowListStatus = useWorkflowStore((state) => state.workflowListStatus)
  const persistenceStatus = useWorkflowStore((state) => state.persistenceStatus)
  const hasLoadedWorkflow = useWorkflowStore((state) => state.hasLoadedWorkflow)
  const openWorkspacePanels = useCanvasUiStore((state) => state.openWorkspacePanels)
  const applyAgentsResponse = useAgentCatalogStore((state) => state.applyResponse)
  const setAgentQueryStatus = useAgentCatalogStore((state) => state.setQueryStatus)
  const applyWorkflowList = useWorkflowStore((state) => state.applyWorkflowList)
  const setWorkflowListQueryStatus = useWorkflowStore((state) => state.setWorkflowListQueryStatus)
  const applyWorkflow = useWorkflowStore((state) => state.applyWorkflow)
  const flushWorkflowPatches = useWorkflowStore((state) => state.flushWorkflowPatches)
  const resetWorkflow = useWorkflowStore((state) => state.resetWorkflow)
  const setPersistenceQueryStatus = useWorkflowStore((state) => state.setPersistenceQueryStatus)
  const toggleWorkspacePanel = useCanvasUiStore((state) => state.toggleWorkspacePanel)
  const agentsQuery = useAgentsQuery()
  const workflowsQuery = useWorkflowListQuery()
  const createWorkflowMutation = useCreateWorkflowMutation()
  const deleteWorkflowMutation = useDeleteWorkflowMutation()
  const [isCanvasMenuOpen, setCanvasMenuOpen] = useState(false)
  const canvasMenuRef = useRef<HTMLDivElement>(null)
  const availableAgentCount = agents.filter((agent) => agent.invokable).length
  const displayTitle = workflowTitle === '默认工作流' ? '未命名工作区' : workflowTitle
  const sortedWorkflows = useMemo(
    () => [...workflows].sort((left, right) => left.createdAt - right.createdAt),
    [workflows],
  )
  const currentCanvasIndex = Math.max(
    1,
    sortedWorkflows.findIndex((workflow) => workflow.id === workflowId) + 1,
  )
  const isBusy = workflowListStatus === 'loading'
    || persistenceStatus === 'loading'
    || persistenceStatus === 'saving'
  const isAssetManagerOpen = openWorkspacePanels.includes('assetManager')
  const isAgentOpen = openWorkspacePanels.includes('agent')

  useEffect(() => {
    if (agentsQuery.isLoading) setAgentQueryStatus('loading')
    if (agentsQuery.isError) {
      setAgentQueryStatus(
        'error',
        agentsQuery.error instanceof Error ? agentsQuery.error.message : String(agentsQuery.error),
      )
    }
    if (agentsQuery.data) applyAgentsResponse(agentsQuery.data)
  }, [
    agentsQuery.data,
    agentsQuery.error,
    agentsQuery.isError,
    agentsQuery.isLoading,
    applyAgentsResponse,
    setAgentQueryStatus,
  ])

  useEffect(() => {
    if (workflowsQuery.isLoading) setWorkflowListQueryStatus('loading')
    if (workflowsQuery.isError) {
      setWorkflowListQueryStatus(
        'error',
        workflowsQuery.error instanceof Error ? workflowsQuery.error.message : String(workflowsQuery.error),
      )
    }
    if (workflowsQuery.data) applyWorkflowList(workflowsQuery.data)
  }, [
    applyWorkflowList,
    setWorkflowListQueryStatus,
    workflowsQuery.data,
    workflowsQuery.error,
    workflowsQuery.isError,
    workflowsQuery.isLoading,
  ])

  useEffect(() => {
    if (!isCanvasMenuOpen) return

    const handlePointerDown = (event: PointerEvent) => {
      if (!canvasMenuRef.current?.contains(event.target as Node)) setCanvasMenuOpen(false)
    }

    document.addEventListener('pointerdown', handlePointerDown)
    return () => document.removeEventListener('pointerdown', handlePointerDown)
  }, [isCanvasMenuOpen])

  const toggleCanvasMenu = () => {
    setCanvasMenuOpen((open) => !open)
    if (!isCanvasMenuOpen) void queryClient.invalidateQueries({ queryKey: workflowQueryKeys.workflows })
  }

  const saveCurrentWorkflow = async () => {
    if (hasLoadedWorkflow) await flushWorkflowPatches()
  }

  const switchCanvas = async (nextWorkflowId: string) => {
    if (nextWorkflowId === workflowId) {
      setCanvasMenuOpen(false)
      return
    }

    await saveCurrentWorkflow()
    setPersistenceQueryStatus('loading')
    const workflow = await queryClient.fetchQuery({
      queryKey: workflowQueryKeys.workflow(nextWorkflowId),
      queryFn: () => fetchWorkflow(nextWorkflowId),
      staleTime: 0,
    })
    applyWorkflow(workflow)
    await navigate({ to: '/canvas/$workflowId', params: { workflowId: nextWorkflowId } })
    setCanvasMenuOpen(false)
  }

  const createCanvas = async () => {
    await saveCurrentWorkflow()
    const nextIndex = workflows.length + 1
    setPersistenceQueryStatus('saving')
    const workflow = await createWorkflowMutation.mutateAsync({
      title: nextIndex === 1 ? '未命名工作区' : `工作流 ${nextIndex}`,
    })
    applyWorkflow(workflow)
    await navigate({ to: '/canvas/$workflowId', params: { workflowId: workflow.id } })
    setCanvasMenuOpen(false)
  }

  const deleteCanvas = async (targetWorkflowId: string, label: string) => {
    if (!window.confirm(`删除「${label}」？此操作不可撤销。`)) return
    const remainingWorkflows = sortedWorkflows
      .filter((workflow) => workflow.id !== targetWorkflowId)
      .sort((left, right) => right.updatedAt - left.updatedAt)
    setPersistenceQueryStatus('saving')
    await deleteWorkflowMutation.mutateAsync(targetWorkflowId)
    applyWorkflowList(remainingWorkflows)
    if (targetWorkflowId === workflowId) {
      const nextWorkflow = remainingWorkflows[0]
      if (nextWorkflow) {
        const workflow = await queryClient.fetchQuery({
          queryKey: workflowQueryKeys.workflow(nextWorkflow.id),
          queryFn: () => fetchWorkflow(nextWorkflow.id),
          staleTime: 0,
        })
        applyWorkflow(workflow)
        await navigate({ to: '/canvas/$workflowId', params: { workflowId: nextWorkflow.id } })
      } else {
        resetWorkflow()
        await navigate({ to: '/' })
      }
    } else {
      setPersistenceQueryStatus('saved')
    }
    setCanvasMenuOpen(false)
  }

  const goHome = async () => {
    await saveCurrentWorkflow()
    await navigate({ to: '/' })
  }

  return {
    availableAgentCount,
    canvasMenuRef,
    currentCanvasIndex,
    displayTitle,
    isAgentOpen,
    isAssetManagerOpen,
    isBusy,
    isCanvasMenuOpen,
    sortedWorkflows,
    workflowId,
    createCanvas: () => void createCanvas(),
    deleteCanvas: (targetWorkflowId: string, label: string) => void deleteCanvas(targetWorkflowId, label),
    goHome: () => void goHome(),
    switchCanvas: (nextWorkflowId: string) => void switchCanvas(nextWorkflowId),
    toggleAgent: () => toggleWorkspacePanel('agent'),
    toggleCanvasMenu,
  }
}
