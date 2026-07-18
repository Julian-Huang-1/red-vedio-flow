import { Bot, Check, ChevronDown, GitBranch, LoaderCircle, PanelsTopLeft, Plus, Trash2 } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useWorkflowStore } from '../../store/workflowStore'
import styles from './TopBar.module.less'

type TopBarProps = {
  navigateTo: (pathname: string) => void
}

export function TopBar({ navigateTo }: TopBarProps) {
  const agents = useWorkflowStore((state) => state.agents)
  const workflowId = useWorkflowStore((state) => state.workflowId)
  const workflowTitle = useWorkflowStore((state) => state.workflowTitle)
  const workflows = useWorkflowStore((state) => state.workflows)
  const workflowListStatus = useWorkflowStore((state) => state.workflowListStatus)
  const persistenceStatus = useWorkflowStore((state) => state.persistenceStatus)
  const openWorkspacePanels = useWorkflowStore((state) => state.openWorkspacePanels)
  const loadAgents = useWorkflowStore((state) => state.loadAgents)
  const loadWorkflows = useWorkflowStore((state) => state.loadWorkflows)
  const loadWorkflow = useWorkflowStore((state) => state.loadWorkflow)
  const createWorkflow = useWorkflowStore((state) => state.createWorkflow)
  const deleteWorkflow = useWorkflowStore((state) => state.deleteWorkflow)
  const saveWorkflow = useWorkflowStore((state) => state.saveWorkflow)
  const toggleWorkspacePanel = useWorkflowStore((state) => state.toggleWorkspacePanel)
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
    void loadAgents()
  }, [loadAgents])

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
    if (!canvasMenuOpen) void loadWorkflows()
  }

  const handleSwitchCanvas = async (nextWorkflowId: string) => {
    if (nextWorkflowId === workflowId) {
      setCanvasMenuOpen(false)
      return
    }

    await saveWorkflow()
    await loadWorkflow(nextWorkflowId)
    navigateTo(`/canvas/${encodeURIComponent(nextWorkflowId)}`)
    setCanvasMenuOpen(false)
  }

  const handleCreateCanvas = async () => {
    await saveWorkflow()
    const workflow = await createWorkflow()
    if (workflow) navigateTo(`/canvas/${encodeURIComponent(workflow.id)}`)
    setCanvasMenuOpen(false)
  }

  const handleDeleteCanvas = async (event: React.MouseEvent<HTMLButtonElement>, targetWorkflowId: string, label: string) => {
    event.stopPropagation()
    const confirmed = window.confirm(`删除「${label}」？此操作不可撤销。`)
    if (!confirmed) return
    const remainingWorkflows = sortedWorkflows
      .filter((workflow) => workflow.id !== targetWorkflowId)
      .sort((left, right) => right.updatedAt - left.updatedAt)
    await deleteWorkflow(targetWorkflowId)
    if (targetWorkflowId === workflowId) {
      const nextWorkflow = remainingWorkflows[0]
      navigateTo(nextWorkflow ? `/canvas/${encodeURIComponent(nextWorkflow.id)}` : '/')
    }
    setCanvasMenuOpen(false)
  }

  const handleLogoClick = async () => {
    await saveWorkflow()
    navigateTo('/')
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
