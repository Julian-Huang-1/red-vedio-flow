import { useEffect, type ReactNode } from 'react'
import { cn } from '@/lib/utils'

type AgentBoxDrawerProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  children: ReactNode
  className?: string
}

export function AgentBoxDrawer({
  open,
  onOpenChange,
  children,
  className,
}: AgentBoxDrawerProps) {
  useEffect(() => {
    if (!open) return

    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onOpenChange(false)
    }

    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [onOpenChange, open])

  return (
    <div
      className={cn('fixed inset-0 z-50', !open && 'pointer-events-none')}
      data-agent-box-drawer=""
      data-open={open ? '' : undefined}
      aria-hidden={!open}
    >
      <button
        type="button"
        className={cn(
          'absolute inset-0 cursor-default bg-black/40 backdrop-blur-[2px] transition-opacity duration-200',
          open ? 'opacity-100' : 'opacity-0',
        )}
        aria-label="关闭 Agent"
        tabIndex={open ? 0 : -1}
        onClick={() => onOpenChange(false)}
      />
      <aside
        className={cn(
          'absolute inset-y-0 right-0 w-full max-w-[440px] overflow-hidden rounded-l-2xl border-l bg-background shadow-2xl transition-transform duration-300 ease-out',
          open ? 'translate-x-0' : 'translate-x-full',
          className,
        )}
        role="dialog"
        aria-modal="true"
        aria-label="Agent 会话"
      >
        {children}
      </aside>
    </div>
  )
}
