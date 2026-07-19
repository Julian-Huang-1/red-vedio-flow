import { useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { Bot, Check, ChevronDown, GitBranch, LoaderCircle, PanelsTopLeft, Plus, Trash2 } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { fetchWorkflow } from '@red-video-flow/workflow-client'
import {
  useAgentsQuery,
  useCreateWorkflowMutation,
  useDeleteWorkflowMutation,
  useSaveWorkflowMutation,
  useWorkflowListQuery,
  workflowQueryKeys,
} from '../../queries/workflowQueries'
import { useWorkflowStore } from '../../store/workflowStore'
import styles from './TopBar.module.less'

export function TopBar() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const agents = useWorkflowStore((state) => state.agents)
  const workflowId = useWorkflowStore((state) => state.workflowId)
  const workflowTitle = useWorkflowStore((state) => state.workflowTitle)
  const workflowRevision = useWorkflowStore((state) => state.workflowRevision)
  const workflows = useWorkflowStore((state) => state.workflows)
  const workflowListStatus = useWorkflowStore((state) => state.workflowListStatus)
  const persistenceStatus = useWorkflowStore((state) => state.persistenceStatus)
  const nodes = useWorkflowStore((state) => state.nodes)
  const edges = useWorkflowStore((state) => state.edges)
  const hasLoadedWorkflow = useWorkflowStore((state) => state.hasLoadedWorkflow)
  const openWorkspacePanels = useWorkflowStore((state) => state.openWorkspacePanels)
  const applyAgentsResponse = useWorkflowStore((state) => state.applyAgentsResponse)
  const setAgentQueryStatus = useWorkflowStore((state) => state.setAgentQueryStatus)
  const applyWorkflowList = useWorkflowStore((state) => state.applyWorkflowList)
  const setWorkflowListQueryStatus = useWorkflowStore((state) => state.setWorkflowListQueryStatus)
  const applyWorkflow = useWorkflowStore((state) => state.applyWorkflow)
  const applySavedWorkflow = useWorkflowStore((state) => state.applySavedWorkflow)
  const resetWorkflow = useWorkflowStore((state) => state.resetWorkflow)
  const setPersistenceQueryStatus = useWorkflowStore((state) => state.setPersistenceQueryStatus)
  const toggleWorkspacePanel = useWorkflowStore((state) => state.toggleWorkspacePanel)
  const agentsQuery = useAgentsQuery()
  const workflowsQuery = useWorkflowListQuery()
  const createWorkflowMutation = useCreateWorkflowMutation()
  const deleteWorkflowMutation = useDeleteWorkflowMutation()
  const saveWorkflowMutation = useSaveWorkflowMutation()
  const [canvasMenuOpen, setCanvasMenuOpen] = useState(false)
  const canvasMenuRef = useRef<HTMLDivElement>(null)
  const availableAgents = agents.filter((agent) => agent.invokable)
  const displayTitle = workflowTitle === '默认工作流' ? '未命名工作区' : workflowTitle
  const sortedWorkflows = useMemo(
    () => [...workflows].sort((left, right) => left.createdAt - right.createdAt),
    [workflows],
  )
  const currentCanvasIndex = Math.max(1, sortedWorkflows.findIndex((workflow) => workflow.id === workflowId) + 1)
  const isBusy = workflowListStatus === 'loading' || persistenceStatus === 'loading' || persistenceStatus === 'saving'

  useEffect(() => {
    if (agentsQuery.isLoading) setAgentQueryStatus('loading')
    if (agentsQuery.isError) {
      setAgentQueryStatus('error', agentsQuery.error instanceof Error ? agentsQuery.error.message : String(agentsQuery.error))
    }
    if (agentsQuery.data) applyAgentsResponse(agentsQuery.data)
  }, [agentsQuery.data, agentsQuery.error, agentsQuery.isError, agentsQuery.isLoading, applyAgentsResponse, setAgentQueryStatus])

  useEffect(() => {
    if (workflowsQuery.isLoading) setWorkflowListQueryStatus('loading')
    if (workflowsQuery.isError) {
      setWorkflowListQueryStatus('error', workflowsQuery.error instanceof Error ? workflowsQuery.error.message : String(workflowsQuery.error))
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
    if (!canvasMenuOpen) return

    const handlePointerDown = (event: PointerEvent) => {
      if (!canvasMenuRef.current?.contains(event.target as Node)) setCanvasMenuOpen(false)
    }

    document.addEventListener('pointerdown', handlePointerDown)
    return () => document.removeEventListener('pointerdown', handlePointerDown)
  }, [canvasMenuOpen])

  const handleCanvasMenuToggle = () => {
    setCanvasMenuOpen((open) => !open)
    if (!canvasMenuOpen) void queryClient.invalidateQueries({ queryKey: workflowQueryKeys.workflows })
  }

  const saveCurrentWorkflow = async () => {
    if (!hasLoadedWorkflow) return
    setPersistenceQueryStatus('saving')
    const workflow = await saveWorkflowMutation.mutateAsync({
      workflowId,
      workflowTitle,
      workflowRevision,
      nodes,
      edges,
    })
    applySavedWorkflow(workflow)
  }

  const handleSwitchCanvas = async (nextWorkflowId: string) => {
    if (nextWorkflowId === workflowId) {
      setCanvasMenuOpen(false)
      return
    }

    await saveCurrentWorkflow()
    setPersistenceQueryStatus('loading')
    const workflow = await queryClient.fetchQuery({
      queryKey: workflowQueryKeys.workflow(nextWorkflowId),
      queryFn: () => fetchWorkflow(nextWorkflowId),
    })
    applyWorkflow(workflow)
    await navigate({ to: '/canvas/$workflowId', params: { workflowId: nextWorkflowId } })
    setCanvasMenuOpen(false)
  }

  const handleCreateCanvas = async () => {
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

  const handleDeleteCanvas = async (event: React.MouseEvent<HTMLButtonElement>, targetWorkflowId: string, label: string) => {
    event.stopPropagation()
    const confirmed = window.confirm(`删除「${label}」？此操作不可撤销。`)
    if (!confirmed) return
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

  const handleLogoClick = async () => {
    await saveCurrentWorkflow()
    await navigate({ to: '/' })
  }

  return (
    <header className="pointer-events-none absolute inset-x-0 top-0 z-20 flex items-start justify-between p-4">
      {openWorkspacePanels.includes('assetManager') ? (
        <div className={styles.topSpacer} />
      ) : (
        <div className={`${styles.floatingBar} pointer-events-auto`}>
          <button className={styles.logoButton} title="回到首页" onClick={() => void handleLogoClick()}>
            <span className={styles.logoMark} />
          </button>
          <button className={styles.workspaceButton} title={displayTitle}>
            <span>{displayTitle}</span>
          </button>
          <span className={styles.divider} />
          <div className={styles.canvasSwitcher} ref={canvasMenuRef}>
            <button
              className={`${styles.canvasButton} ${canvasMenuOpen ? styles.canvasButtonActive : ''}`}
              title="切换画布"
              onClick={handleCanvasMenuToggle}
            >
              <span>画布 {currentCanvasIndex}</span>
              <ChevronDown size={13} />
            </button>
            {canvasMenuOpen ? (
              <div className={styles.canvasMenu} role="menu" aria-label="切换画布">
                <div className={styles.canvasMenuHeader}>画布</div>
                <div className={styles.canvasMenuList}>
                  {sortedWorkflows.map((workflow, index) => (
                    <div
                      key={workflow.id}
                      className={workflow.id === workflowId ? styles.canvasMenuItemActive : styles.canvasMenuItem}
                    >
                      <button disabled={isBusy} onClick={() => void handleSwitchCanvas(workflow.id)}>
                        <span>
                          <strong>画布 {index + 1}</strong>
                          <small>{workflow.title === '默认工作流' ? '未命名工作区' : workflow.title}</small>
                        </span>
                        {workflow.id === workflowId ? <Check size={16} /> : null}
                      </button>
                      <button
                        className={styles.deleteCanvasButton}
                        title={`删除画布 ${index + 1}`}
                        disabled={isBusy}
                        onClick={(event) => {
                          void handleDeleteCanvas(event, workflow.id, `画布 ${index + 1}`)
                        }}
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  ))}
                  {sortedWorkflows.length === 0 ? <div className={styles.canvasMenuEmpty}>暂无画布</div> : null}
                </div>
                <button className={styles.createCanvasButton} disabled={isBusy} onClick={() => void handleCreateCanvas()}>
                  {isBusy ? <LoaderCircle size={16} className={styles.spinIcon} /> : <Plus size={16} />}
                  新建画布
                </button>
              </div>
            ) : null}
          </div>
        </div>
      )}

      <div className={`${styles.segmented} pointer-events-auto`}>
        <button className={styles.segmentActive}>
          <GitBranch size={15} />
          工作流
        </button>
        <button className={styles.segmentButton}>
          <PanelsTopLeft size={15} />
          故事板
        </button>
      </div>

      <div className="pointer-events-auto flex items-center gap-2">
        <button
          className={`${styles.agentButton} ${openWorkspacePanels.includes('agent') ? styles.agentButtonActive : ''}`}
          title="打开 Agent"
          onClick={() => toggleWorkspacePanel('agent')}
        >
          <Bot size={17} />
          Agent
        </button>
        {availableAgents.length === 0 ? null : <span className={styles.agentCount}>{availableAgents.length}</span>}
      </div>
    </header>
  )
}
