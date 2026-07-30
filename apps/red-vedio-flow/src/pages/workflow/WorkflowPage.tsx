import { WorkflowCanvas } from '@/components/workflow'

export function WorkflowPage() {
  return (
    <main className="h-[calc(100vh-4rem)] w-full bg-muted/20 p-4">
      <section className="h-full overflow-hidden rounded-2xl border bg-card shadow-sm">
        <WorkflowCanvas />
      </section>
    </main>
  )
}
