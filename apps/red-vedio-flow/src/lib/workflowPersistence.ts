import { saveWorkflow } from '@red-video-flow/workflow-client'
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
  while (true) {
    const state = useWorkflowStore.getState()
    if (!state.changeVersion || !state.revision) return
    const workflowId = state.workflowId
    const savedVersion = state.changeVersion
    const document = state.toWorkflowDocument()
    const saved = await saveWorkflow({
      id: document.id,
      title: document.title,
      graph: document.graph,
      baseRevision: document.revision,
    })
    useWorkflowStore.getState().markSaved(saved, savedVersion)
    const latest = useWorkflowStore.getState()
    if (latest.workflowId !== workflowId || !latest.changeVersion) return
  }
}
