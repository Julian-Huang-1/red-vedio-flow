import { ReactFlowProvider } from '@xyflow/react'
import { useEffect } from 'react'
import { AgentDrawer } from '../../components/layout/AgentDrawer'
import { AssetManager } from '../../components/layout/AssetManager'
import { BottomToolbar } from '../../components/layout/BottomToolbar'
import { CanvasZoomIndicator } from '../../components/layout/CanvasZoomIndicator'
import { CanvasToolRail } from '../../components/layout/CanvasToolRail'
import { TopBar } from '../../components/layout/TopBar'
import { WorkflowCanvas } from '../../components/workflow/WorkflowCanvas'
import { useSaveWorkflowMutation, useWorkflowQuery } from '../../queries/workflowQueries'
import { useWorkflowStore } from '../../store/workflowStore'

export function CanvasEditorPage({ workflowId }: { workflowId: string }) {
  const nodes = useWorkflowStore((state) => state.nodes)
  const edges = useWorkflowStore((state) => state.edges)
  const workflowTitle = useWorkflowStore((state) => state.workflowTitle)
  const workflowRevision = useWorkflowStore((state) => state.workflowRevision)
  const loadedWorkflowId = useWorkflowStore((state) => state.workflowId)
  const hasLoadedWorkflow = useWorkflowStore((state) => state.hasLoadedWorkflow)
  const applyWorkflow = useWorkflowStore((state) => state.applyWorkflow)
  const applySavedWorkflow = useWorkflowStore((state) => state.applySavedWorkflow)
  const setPersistenceQueryStatus = useWorkflowStore((state) => state.setPersistenceQueryStatus)
  const workflowQuery = useWorkflowQuery(workflowId)
  const saveWorkflowMutation = useSaveWorkflowMutation()

  useEffect(() => {
    if (workflowQuery.isLoading) setPersistenceQueryStatus('loading')
    if (workflowQuery.isError) {
      setPersistenceQueryStatus('error', workflowQuery.error instanceof Error ? workflowQuery.error.message : String(workflowQuery.error))
    }
    if (workflowQuery.data && (!hasLoadedWorkflow || loadedWorkflowId !== workflowQuery.data.id)) {
      applyWorkflow(workflowQuery.data)
    }
  }, [
    applyWorkflow,
    hasLoadedWorkflow,
    loadedWorkflowId,
    setPersistenceQueryStatus,
    workflowQuery.data,
    workflowQuery.error,
    workflowQuery.isError,
    workflowQuery.isLoading,
  ])

  useEffect(() => {
    if (!hasLoadedWorkflow || loadedWorkflowId !== workflowId) return
    const timeout = window.setTimeout(() => {
      setPersistenceQueryStatus('saving')
      void saveWorkflowMutation
        .mutateAsync({ workflowId, workflowTitle, workflowRevision, nodes, edges })
        .then((workflow) => applySavedWorkflow(workflow))
        .catch((error) => {
          setPersistenceQueryStatus('error', error instanceof Error ? error.message : String(error))
        })
    }, 800)

    return () => window.clearTimeout(timeout)
  }, [
    applyWorkflow,
    applySavedWorkflow,
    edges,
    hasLoadedWorkflow,
    loadedWorkflowId,
    nodes,
    saveWorkflowMutation,
    setPersistenceQueryStatus,
    workflowId,
    workflowRevision,
    workflowTitle,
  ])

  return (
    <ReactFlowProvider>
      <main className="relative h-screen w-screen overflow-hidden bg-canvas text-white">
        <WorkflowCanvas />
        <CanvasToolRail />
        <AssetManager />
        <CanvasZoomIndicator />
        <AgentDrawer />
        <TopBar />
        <BottomToolbar />
      </main>
    </ReactFlowProvider>
  )
}
