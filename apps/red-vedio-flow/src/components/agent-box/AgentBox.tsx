import { forwardRef, type HTMLAttributes } from 'react'
import { cn } from '@/lib/utils'

const Root = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn('relative grid h-full min-h-0 grid-rows-[auto_minmax(0,1fr)_auto] bg-background', className)}
      data-agent-box-root=""
      {...props}
    />
  ),
)
Root.displayName = 'AgentBox.Root'

function Header({ className, ...props }: HTMLAttributes<HTMLElement>) {
  return (
    <header
      className={cn('flex min-h-16 items-center justify-between gap-4 border-b px-5', className)}
      data-agent-box-header=""
      {...props}
    />
  )
}

function Context({ className, ...props }: HTMLAttributes<HTMLElement>) {
  return (
    <section
      className={cn('border-b bg-muted/25 px-5 py-4', className)}
      data-agent-box-context=""
      {...props}
    />
  )
}

const Messages = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn('flex min-h-0 min-w-0 flex-col gap-5 overflow-x-hidden overflow-y-auto px-5 py-6', className)}
      data-agent-box-messages=""
      {...props}
    />
  ),
)
Messages.displayName = 'AgentBox.Messages'

type MessageProps = HTMLAttributes<HTMLElement> & {
  role: 'user' | 'assistant'
}

function Message({ role, className, ...props }: MessageProps) {
  return (
    <article
      className={cn(
        'min-w-0 max-w-[88%] overflow-hidden rounded-2xl px-4 py-3 text-sm leading-6 [overflow-wrap:anywhere]',
        role === 'user'
          ? 'ml-auto rounded-br-md bg-primary text-primary-foreground'
          : 'mr-auto rounded-bl-md border bg-card text-card-foreground shadow-sm',
        className,
      )}
      data-agent-box-message=""
      data-role={role}
      {...props}
    />
  )
}

function Composer({ className, ...props }: HTMLAttributes<HTMLElement>) {
  return (
    <footer
      className={cn('bg-card p-4', className)}
      data-agent-box-composer=""
      {...props}
    />
  )
}

export const AgentBox = {
  Root,
  Header,
  Context,
  Messages,
  Message,
  Composer,
}
