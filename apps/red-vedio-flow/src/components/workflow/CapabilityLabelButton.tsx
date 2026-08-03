import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

export function CapabilityLabelButton({
  direction,
  active,
  target,
  onClick,
}: {
  direction: 'input' | 'output'
  active: boolean
  target: 'node' | 'composer'
  onClick: () => void
}) {
  const shortLabel = direction === 'input' ? 'IN' : 'OUT'
  const title = `${target === 'node' ? '节点' : 'Composer'} ${direction === 'input' ? 'Input' : 'Output'} Label`
  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      className={cn(
        'nodrag nopan h-6 min-w-7 rounded-md px-1 text-[9px] font-bold tracking-tight text-muted-foreground',
        active && 'bg-primary text-primary-foreground hover:bg-primary/90 hover:text-primary-foreground',
      )}
      aria-label={title}
      aria-pressed={active}
      title={title}
      data-capability-label=""
      data-direction={direction}
      data-target={target}
      data-active={active ? '' : undefined}
      onPointerDown={(event) => event.stopPropagation()}
      onClick={(event) => {
        event.stopPropagation()
        onClick()
      }}
    >
      {shortLabel}
    </Button>
  )
}
