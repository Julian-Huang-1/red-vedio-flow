export function WorkflowPage() {
  return (
    <main className="min-h-[calc(100vh-4rem)] w-full px-6 py-10">
      <section className="h-[calc(100vh-9rem)] overflow-hidden rounded-2xl border border-dashed bg-card">
        <div className="flex h-full items-center justify-center text-center">
          <div>
            <span className="text-sm font-medium text-muted-foreground">Workflow</span>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight">工作流画布</h1>
            <p className="mt-3 text-muted-foreground">AgentBox 完整状态与交互能力预览。</p>
          </div>
        </div>
      </section>
    </main>
  )
}
