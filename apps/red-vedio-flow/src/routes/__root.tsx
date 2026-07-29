import { createRootRoute, Link, Outlet } from '@tanstack/react-router'
import { cn } from '@/lib/utils'

function RootLayout() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b bg-card">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
          <Link to="/home" className="font-semibold tracking-tight">
            red-vedio-flow
          </Link>
          <nav className="flex items-center gap-1" aria-label="主导航">
            {[
              { to: '/home', label: 'Home' },
              { to: '/workflow', label: 'Workflow' },
            ].map((item) => (
              <Link
                key={item.to}
                to={item.to}
                className={cn(
                  'rounded-md px-3 py-2 text-sm text-muted-foreground transition-colors',
                  'hover:bg-accent hover:text-accent-foreground',
                )}
                activeProps={{
                  className: 'bg-accent text-accent-foreground',
                }}
              >
                {item.label}
              </Link>
            ))}
          </nav>
        </div>
      </header>
      <Outlet />
    </div>
  )
}

export const Route = createRootRoute({
  component: RootLayout,
})
