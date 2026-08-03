import { useEffect, type ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { ResourceLibrary } from '@/components/resources'
import { useResourceLibraryStore } from '@/stores/resourceLibraryStore'

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
  const resourceLibraryOpen = useResourceLibraryStore((state) =>
    state.open && state.addTarget?.type === 'agent-resource')
  const closeResourceLibrary = useResourceLibraryStore((state) => state.closeLibrary)
  useEffect(() => {
    if (!open) return

    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      if (resourceLibraryOpen) closeResourceLibrary()
      else onOpenChange(false)
    }

    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [closeResourceLibrary, onOpenChange, open, resourceLibraryOpen])

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
      <ResourceLibrary
        variant="agent"
        className="right-[440px] z-20 mr-[2px] animate-in rounded-2xl fade-in slide-in-from-bottom-6 duration-300 max-[820px]:right-0 max-[820px]:z-40"
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
