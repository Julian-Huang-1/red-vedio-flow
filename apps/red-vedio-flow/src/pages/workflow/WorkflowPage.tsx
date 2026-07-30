import {
  WorkflowCanvas,
  WorkspaceManager,
  useWorkflowAutosave,
} from '@/components/workflow'
import { ResourceLibrary } from '@/components/resources'

export function WorkflowPage() {
  useWorkflowAutosave()

  return (
    <main className="h-[calc(100vh-4rem)] w-full bg-muted/20 p-4">
      <section className="relative h-full overflow-hidden rounded-2xl border bg-card shadow-sm">
        <div className="flex h-full min-h-0 flex-col">
          <div className="flex h-14 shrink-0 items-center border-b px-3">
            <WorkspaceManager />
          </div>
          <div className="min-h-0 flex-1">
            <WorkflowCanvas />
          </div>
        </div>
        <ResourceLibrary />
      </section>
    </main>
  )
}
