import { useEffect } from 'react'
import { useWorkflowQuery } from '../../queries/workflowQueries'
import { useWorkflowStore } from '../../store/workflowStore'

export function useCanvasEditorPage(workflowId: string) {
  const nodes = useWorkflowStore((state) => state.nodes)
  const workflowRevision = useWorkflowStore((state) => state.workflowRevision)
  const loadedWorkflowId = useWorkflowStore((state) => state.workflowId)
  const hasLoadedWorkflow = useWorkflowStore((state) => state.hasLoadedWorkflow)
  const persistenceStatus = useWorkflowStore((state) => state.persistenceStatus)
  const applyWorkflow = useWorkflowStore((state) => state.applyWorkflow)
  const applyRemoteWorkflow = useWorkflowStore((state) => state.applyRemoteWorkflow)
  const setPersistenceQueryStatus = useWorkflowStore((state) => state.setPersistenceQueryStatus)
  const hasRunningNodes = nodes.some((node) => node.data.status === 'running')
  const workflowQuery = useWorkflowQuery(workflowId, hasRunningNodes)

  useEffect(() => {
    if (workflowQuery.isLoading) setPersistenceQueryStatus('loading')
    if (workflowQuery.isError) {
      setPersistenceQueryStatus(
        'error',
        workflowQuery.error instanceof Error ? workflowQuery.error.message : String(workflowQuery.error),
      )
    }
    if (workflowQuery.data && (!hasLoadedWorkflow || loadedWorkflowId !== workflowQuery.data.id)) {
      applyWorkflow(workflowQuery.data)
    } else if (
      workflowQuery.data
      && workflowQuery.data.revision > workflowRevision
      && persistenceStatus !== 'saving'
    ) {
      applyRemoteWorkflow(workflowQuery.data)
    }
  }, [
    applyWorkflow,
    applyRemoteWorkflow,
    hasLoadedWorkflow,
    loadedWorkflowId,
    persistenceStatus,
    setPersistenceQueryStatus,
    workflowQuery.data,
    workflowQuery.error,
    workflowQuery.isError,
    workflowQuery.isLoading,
    workflowRevision,
  ])

  return {
    state: workflowQuery.isError ? 'error' : workflowQuery.isLoading ? 'loading' : 'ready',
  } as const
}

