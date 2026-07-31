import {
  WorkflowCanvas,
  useWorkflowAutosave,
} from '@/components/workflow'
import { ResourceLibrary } from '@/components/resources'

export function WorkflowPage() {
  useWorkflowAutosave()

  return (
    <main className="h-screen w-full bg-muted/20">
      <section className="relative h-full overflow-hidden border bg-card shadow-sm">
        <div className="flex h-full min-h-0 flex-col">
          <div className="min-h-0 flex-1">
            <WorkflowCanvas />
          </div>
        </div>
        <ResourceLibrary />
      </section>
    </main>
  )
}
