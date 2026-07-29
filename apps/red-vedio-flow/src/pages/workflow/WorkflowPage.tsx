import { Sparkles } from 'lucide-react'
import {
  AgentBoxDrawer,
  AgentBoxPanel,
  useAgentBoxStore,
} from '@/components/agent-box'
import { Button } from '@/components/ui/button'

export function WorkflowPage() {
  const open = useAgentBoxStore((state) => state.open)
  const unreadCount = useAgentBoxStore((state) => state.unreadCount)
  const openDrawer = useAgentBoxStore((state) => state.openDrawer)
  const closeDrawer = useAgentBoxStore((state) => state.closeDrawer)

  return (
    <>
      <main className="mx-auto min-h-[calc(100vh-4rem)] max-w-6xl px-6 py-10">
        <section className="relative h-[calc(100vh-9rem)] overflow-hidden rounded-2xl border border-dashed bg-card">
          <div className="absolute right-5 top-5">
            <Button className="relative" onClick={openDrawer}>
              <Sparkles size={16} />
              打开 Agent
              {unreadCount ? (
                <span className="absolute -right-2 -top-2 grid size-5 place-items-center rounded-full bg-destructive text-[10px] text-destructive-foreground">
                  {unreadCount}
                </span>
              ) : null}
            </Button>
          </div>
          <div className="flex h-full items-center justify-center text-center">
            <div>
              <span className="text-sm font-medium text-muted-foreground">Workflow</span>
              <h1 className="mt-2 text-3xl font-semibold tracking-tight">工作流画布</h1>
              <p className="mt-3 text-muted-foreground">AgentBox 完整状态与交互能力预览。</p>
            </div>
          </div>
        </section>
      </main>

      <AgentBoxDrawer open={open} onOpenChange={(nextOpen) => {
        if (nextOpen) openDrawer()
        else closeDrawer()
      }}>
        <AgentBoxPanel />
      </AgentBoxDrawer>
    </>
  )
}
