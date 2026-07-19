import { useNavigate } from '@tanstack/react-router'
import { useEffect, useMemo } from 'react'
import { InspirationBox } from './components/InspirationBox'
import { RecentWorkflowRail } from './components/RecentWorkflowRail'
import { SkillChips } from './components/SkillChips'
import { StartActions } from './components/StartActions'
import { StartHeader } from './components/StartHeader'
import { useCreateWorkflowMutation, useWorkflowListQuery } from '../../queries/workflowQueries'
import { useWorkflowStore } from '../../store/workflowStore'
import styles from '../../App.module.less'

export function HomePage() {
  const navigate = useNavigate()
  const workflows = useWorkflowStore((state) => state.workflows)
  const workflowListStatus = useWorkflowStore((state) => state.workflowListStatus)
  const persistenceStatus = useWorkflowStore((state) => state.persistenceStatus)
  const persistenceError = useWorkflowStore((state) => state.persistenceError)
  const workflowListError = useWorkflowStore((state) => state.workflowListError)
  const applyWorkflowList = useWorkflowStore((state) => state.applyWorkflowList)
  const applyWorkflow = useWorkflowStore((state) => state.applyWorkflow)
  const setWorkflowListQueryStatus = useWorkflowStore((state) => state.setWorkflowListQueryStatus)
  const setPersistenceQueryStatus = useWorkflowStore((state) => state.setPersistenceQueryStatus)
  const workflowsQuery = useWorkflowListQuery()
  const createWorkflowMutation = useCreateWorkflowMutation()

  useEffect(() => {
    if (workflowsQuery.isLoading) setWorkflowListQueryStatus('loading')
    if (workflowsQuery.isError) {
      setWorkflowListQueryStatus('error', workflowsQuery.error instanceof Error ? workflowsQuery.error.message : String(workflowsQuery.error))
    }
    if (workflowsQuery.data) applyWorkflowList(workflowsQuery.data)
  }, [applyWorkflowList, setWorkflowListQueryStatus, workflowsQuery.data, workflowsQuery.error, workflowsQuery.isError, workflowsQuery.isLoading])

  const createCanvasAndOpen = async () => {
    const nextIndex = workflows.length + 1
    setPersistenceQueryStatus('saving')
    try {
      const workflow = await createWorkflowMutation.mutateAsync({
        title: nextIndex === 1 ? '未命名工作区' : `工作流 ${nextIndex}`,
      })
      applyWorkflow(workflow)
      await navigate({ to: '/canvas/$workflowId', params: { workflowId: workflow.id } })
    } catch (error) {
      setPersistenceQueryStatus('error', error instanceof Error ? error.message : String(error))
    }
  }
  const recentWorkflows = useMemo(
    () => [...workflows].sort((left, right) => right.updatedAt - left.updatedAt).slice(0, 3),
    [workflows],
  )
  const openCanvas = (workflowId: string) => {
    void navigate({ to: '/canvas/$workflowId', params: { workflowId } })
  }

  return (
    <main className="relative h-screen w-screen overflow-hidden bg-canvas text-white">
      <section className={styles.startScreen}>
        <StartHeader />
        <RecentWorkflowRail workflows={recentWorkflows} onOpenCanvas={openCanvas} />
        <StartActions
          disabled={workflowListStatus === 'loading' || persistenceStatus === 'saving'}
          isCreating={persistenceStatus === 'saving'}
          onCreate={() => void createCanvasAndOpen()}
        />
        <InspirationBox onSubmit={() => void createCanvasAndOpen()} />
        <SkillChips onSelect={() => void createCanvasAndOpen()} />

        {persistenceStatus === 'error' ? (
          <p className={styles.startError}>{persistenceError ?? workflowListError}</p>
        ) : null}
      </section>
    </main>
  )
}
