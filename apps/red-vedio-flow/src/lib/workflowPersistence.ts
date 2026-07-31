import {
  fetchWorkflow,
  saveWorkflow,
  WorkflowClientResponseError,
} from '@red-video-flow/workflow-client'
import { useWorkflowStore } from '@/stores/workflowStore'

let activeSave: Promise<void> | undefined

export async function persistCurrentWorkflow() {
  if (activeSave) return activeSave
  activeSave = saveUntilCurrent()
  try {
    await activeSave
  } finally {
    activeSave = undefined
  }
}

async function saveUntilCurrent() {
  let revisionRetries = 0
  while (true) {
    const state = useWorkflowStore.getState()
    if (!state.changeVersion || !state.revision) return
    const workflowId = state.workflowId
    const savedVersion = state.changeVersion
    const document = state.toWorkflowDocument()
    let saved
    try {
      saved = await saveWorkflow({
        id: document.id,
        title: document.title,
        graph: document.graph,
        baseRevision: document.revision,
      })
    } catch (error) {
      if (
        !(error instanceof WorkflowClientResponseError)
        || error.status !== 409
        || revisionRetries >= 5
      ) {
        throw error
      }
      revisionRetries += 1
      const latest = await fetchWorkflow(workflowId)
      const current = useWorkflowStore.getState()
      if (current.workflowId !== workflowId) return
      current.syncExecutionState(latest)
      continue
    }
    revisionRetries = 0
    useWorkflowStore.getState().markSaved(saved, savedVersion)
    const latest = useWorkflowStore.getState()
    if (latest.workflowId !== workflowId || !latest.changeVersion) return
  }
}
