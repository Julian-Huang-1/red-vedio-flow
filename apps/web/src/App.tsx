import { ReactFlowProvider } from '@xyflow/react'
import { BottomToolbar } from './components/layout/BottomToolbar'
import { TopBar } from './components/layout/TopBar'
import { WorkflowCanvas } from './components/workflow/WorkflowCanvas'
import { ComponentShowcase } from './pages/ComponentShowcase'

function WorkflowPage() {
  return (
    <ReactFlowProvider>
      <main className="relative h-screen w-screen overflow-hidden bg-canvas text-white">
        <WorkflowCanvas />
        <TopBar />
        <BottomToolbar />
      </main>
    </ReactFlowProvider>
  )
}

export default function App() {
  if (window.location.pathname === '/components') return <ComponentShowcase />

  return <WorkflowPage />
}
