import { createRootRoute, Link, Outlet } from '@tanstack/react-router'
import { Sparkles } from 'lucide-react'
import {
  AgentBoxDrawer,
  AgentBoxPanel,
  useAgentBoxStore,
} from '@/components/agent-box'
import { WorkspaceManager } from '@/components/workflow'
import { Button } from '@/components/ui/button'

function RootLayout() {
  const open = useAgentBoxStore((state) => state.open)
  const unreadCount = useAgentBoxStore((state) => state.unreadCount)
  const openDrawer = useAgentBoxStore((state) => state.openDrawer)
  const closeDrawer = useAgentBoxStore((state) => state.closeDrawer)

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b bg-card">
        <div className="flex h-16 w-full items-center justify-between px-6">
          <div className="flex items-center gap-4">
            <Link to="/home" className="font-semibold tracking-tight">
              Y
            </Link>
            <WorkspaceManager />
          </div>
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
      </header>
      <Outlet />
      <AgentBoxDrawer
        open={open}
        onOpenChange={(nextOpen) => {
          if (nextOpen) openDrawer()
          else closeDrawer()
        }}
      >
        <AgentBoxPanel />
      </AgentBoxDrawer>
    </div>
  )
}

export const Route = createRootRoute({
  component: RootLayout,
})
