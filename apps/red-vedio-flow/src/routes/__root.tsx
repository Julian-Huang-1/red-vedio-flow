import {
  createRootRoute,
  Link,
  Outlet,
  useRouterState,
} from '@tanstack/react-router'
import { KeyRound, Sparkles } from 'lucide-react'
import { useState } from 'react'
import {
  AgentBoxDrawer,
  AgentBoxPanel,
  useAgentBoxStore,
} from '@/components/agent-box'
import { WorkspaceManager } from '@/components/workflow'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { ModelSettingsDialog } from '@/components/model-settings'
import { useResourceLibraryStore } from '@/stores/resourceLibraryStore'

const WORKSPACE_TABS = [
  { label: '画布', to: '/workflow' },
  { label: 'App Builder', to: '/app-builder' },
] as const

function WorkspaceTabs() {
  const pathname = useRouterState({ select: (state) => state.location.pathname })

  return (
    <nav className="inline-flex items-center gap-1 rounded-xl border bg-muted/40 p-1">
      {WORKSPACE_TABS.map((tab) => {
        const active = pathname === tab.to
        return (
          <Link
            key={tab.to}
            to={tab.to}
            className={cn(
              'rounded-lg px-4 py-1.5 text-sm font-medium transition-colors',
              active
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {tab.label}
          </Link>
        )
      })}
    </nav>
  )
}

function RootLayout() {
  const [modelSettingsOpen, setModelSettingsOpen] = useState(false)
  const pathname = useRouterState({ select: (state) => state.location.pathname })
  const open = useAgentBoxStore((state) => state.open)
  const unreadCount = useAgentBoxStore((state) => state.unreadCount)
  const openDrawer = useAgentBoxStore((state) => state.openDrawer)
  const closeDrawer = useAgentBoxStore((state) => state.closeDrawer)
  const closeResourceLibrary = useResourceLibraryStore((state) => state.closeLibrary)

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="relative border-b bg-card">
        <div className="flex h-16 w-full items-center justify-between px-6">
          <div className="flex items-center gap-4">
            {/* <Link to="/home" className="font-semibold tracking-tight">
              Y
            </Link> */}
            {pathname === '/workflow' ? <WorkspaceManager /> : null}
          </div>
          <div className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
            <div className="pointer-events-auto">
              <WorkspaceTabs />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setModelSettingsOpen(true)}
            >
              <KeyRound size={16} />
              设置key
            </Button>
            {/* <Button className="relative" onClick={openDrawer}>
              <Sparkles size={16} />
              打开 Agent
              {unreadCount ? (
                <span className="absolute -right-2 -top-2 grid size-5 place-items-center rounded-full bg-destructive text-[10px] text-destructive-foreground">
                  {unreadCount}
                </span>
              ) : null}
            </Button> */}
          </div>
        </div>
      </header>
      <Outlet />
      <AgentBoxDrawer
        open={open}
        onOpenChange={(nextOpen) => {
          if (nextOpen) openDrawer()
          else {
            closeResourceLibrary()
            closeDrawer()
          }
        }}
      >
        <AgentBoxPanel />
      </AgentBoxDrawer>
      <ModelSettingsDialog
        open={modelSettingsOpen}
        onOpenChange={setModelSettingsOpen}
      />
    </div>
  )
}

export const Route = createRootRoute({
  component: RootLayout,
})
