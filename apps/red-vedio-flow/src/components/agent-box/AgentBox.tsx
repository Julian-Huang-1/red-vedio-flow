import { forwardRef, type HTMLAttributes } from 'react'
import { Bot } from 'lucide-react'
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
      className={cn('flex min-h-0 min-w-0 flex-col gap-6 overflow-x-hidden overflow-y-auto px-5 py-5 [scrollbar-gutter:stable]', className)}
      data-agent-box-messages=""
      aria-live="polite"
      {...props}
    />
  ),
)
Messages.displayName = 'AgentBox.Messages'

type MessageProps = HTMLAttributes<HTMLElement> & {
  role: 'user' | 'assistant'
}

function Message({ role, className, children, ...props }: MessageProps) {
  return (
    <article
      className={cn(
        'flex h-auto w-full min-w-0 shrink-0 items-start gap-3 text-sm leading-6 [overflow-wrap:anywhere]',
        role === 'user' ? 'justify-end' : 'justify-start',
        className,
      )}
      data-agent-box-message=""
      data-role={role}
      {...props}
    >
      {role === 'assistant' ? (
        <div
          className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-lg border bg-muted/50 text-muted-foreground"
          data-agent-box-message-avatar=""
          aria-hidden="true"
        >
          <Bot size={14} />
        </div>
      ) : null}
      <div
        className={cn(
          'h-auto min-w-0 max-w-full',
          role === 'user'
            ? 'max-w-[86%] rounded-2xl rounded-br-md bg-primary px-4 py-2.5 text-primary-foreground'
            : 'flex-1 pt-0.5 text-foreground',
        )}
        data-agent-box-message-surface=""
      >
        {children}
      </div>
    </article>
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
