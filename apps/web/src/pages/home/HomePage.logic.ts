import { useNavigate } from '@tanstack/react-router'
import { useEffect, useMemo } from 'react'
import { useCreateWorkflowMutation, useWorkflowListQuery } from '../../queries/workflowQueries'
import { useWorkflowStore } from '../../store/workflowStore'

export function useHomePage() {
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

  const recentWorkflows = useMemo(
    () => [...workflows].sort((left, right) => right.updatedAt - left.updatedAt).slice(0, 3),
    [workflows],
  )

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

  return {
    recentWorkflows,
    isBusy: workflowListStatus === 'loading' || persistenceStatus === 'saving',
    isCreating: persistenceStatus === 'saving',
    error: persistenceStatus === 'error' ? persistenceError ?? workflowListError : undefined,
    createCanvas: () => void createCanvasAndOpen(),
    openCanvas: (workflowId: string) => {
      void navigate({ to: '/canvas/$workflowId', params: { workflowId } })
    },
  }
}

