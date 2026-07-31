import {
  createRootRoute,
  Link,
  Outlet,
  useRouterState,
} from '@tanstack/react-router'
import { Home, KeyRound, Sparkles } from 'lucide-react'
import { useEffect, useState } from 'react'
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
    <nav className="inline-flex h-12 flex-nowrap items-center gap-1 whitespace-nowrap rounded-xl border bg-card p-1 shadow-sm">
      {WORKSPACE_TABS.map((tab) => {
        const active = pathname === tab.to
        return (
          <Link
            key={tab.to}
            to={tab.to}
            className={cn(
              'h-9 shrink-0 whitespace-nowrap rounded-lg px-3.5 text-sm font-medium leading-9 transition-colors',
              active
                ? 'bg-muted text-foreground'
                : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground',
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
  const isPublishedApp = pathname.startsWith('/published-app/')
  const isAppBuilder = pathname === '/app-builder'
  const open = useAgentBoxStore((state) => state.open)
  const unreadCount = useAgentBoxStore((state) => state.unreadCount)
  const openDrawer = useAgentBoxStore((state) => state.openDrawer)
  const closeDrawer = useAgentBoxStore((state) => state.closeDrawer)
  const closeResourceLibrary = useResourceLibraryStore((state) => state.closeLibrary)

  useEffect(() => {
    if (!isAppBuilder) closeDrawer()
  }, [closeDrawer, isAppBuilder])

  return (
    <div className="min-h-screen bg-background text-foreground">
      {!isPublishedApp ? <header
        className="pointer-events-none fixed inset-x-3 top-3 z-40 flex h-12 items-center justify-between gap-2 sm:inset-x-5 sm:top-5 md:gap-3"
        data-workspace-header=""
      >
        <div className="pointer-events-auto flex min-w-0 items-center gap-3">
          <div className="flex h-12 min-w-0 items-center gap-2 rounded-xl border bg-card p-1 shadow-sm">
            <Button asChild type="button" variant="ghost" size="icon" className="size-9 shrink-0">
              <Link to="/home" aria-label="返回我的应用">
                <Home size={18} />
              </Link>
            </Button>
            {pathname === '/workflow' ? (
              <div className="hidden md:block">
                <WorkspaceManager />
              </div>
            ) : null}
          </div>
        </div>
        <div className="pointer-events-auto absolute left-1/2 top-0 -translate-x-1/2">
          <WorkspaceTabs />
        </div>
        <div className="pointer-events-auto flex h-12 shrink-0 items-center gap-2 rounded-xl border bg-card p-1 shadow-sm">
            <Button
              type="button"
              variant="ghost"
              className="h-9"
              onClick={() => setModelSettingsOpen(true)}
            >
              <KeyRound size={16} />
              <span className="hidden sm:inline">设置key</span>
            </Button>
            {isAppBuilder ? (
              <Button className="relative" onClick={openDrawer}>
                <Sparkles size={16} />
                <span className="hidden sm:inline">打开 Agent</span>
                {unreadCount ? (
                  <span className="absolute -right-2 -top-2 grid size-5 place-items-center rounded-full bg-destructive text-[10px] text-destructive-foreground">
                    {unreadCount}
                  </span>
                ) : null}
              </Button>
            ) : null}
        </div>
      </header> : null}
      <Outlet />
      {isAppBuilder ? (
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
      ) : null}
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
