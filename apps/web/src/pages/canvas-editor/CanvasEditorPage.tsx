import { ReactFlowProvider } from '@xyflow/react'
import { AgentDrawer } from '../../components/layout/AgentDrawer'
import { AssetManager } from '../../components/layout/AssetManager'
import { BottomToolbar } from '../../components/layout/BottomToolbar'
import { CanvasZoomIndicator } from '../../components/layout/CanvasZoomIndicator'
import { CanvasToolRail } from '../../components/layout/CanvasToolRail'
import { TopBar } from '../../components/layout/TopBar'
import { WorkflowCanvas } from '../../components/workflow/WorkflowCanvas'
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
