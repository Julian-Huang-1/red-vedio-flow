import { ReactFlowProvider } from '@xyflow/react'
import { WorkflowCanvas } from '../../components/workflow/WorkflowCanvas'
import { ExtensionSlot } from '../../extension-system/ExtensionSlot'
import { useCanvasEditorPage } from './CanvasEditorPage.logic'

export function CanvasEditorPage({ workflowId }: { workflowId: string }) {
  const page = useCanvasEditorPage(workflowId)

  return (
    <ReactFlowProvider>
      <main
        className="relative h-screen w-screen overflow-hidden bg-canvas text-white"
        data-state={page.state}
      >
        <WorkflowCanvas />
        <ExtensionSlot name="canvas.overlay" />
      </main>
    </ReactFlowProvider>
  )
}
