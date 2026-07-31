import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { cn } from '@/lib/utils'

type MarkdownContentProps = {
  children: string
  className?: string
}

export function MarkdownContent({ children, className }: MarkdownContentProps) {
  return (
    <div
      className={cn(
        'max-w-full break-words',
        '[&>*:first-child]:mt-0 [&>*:last-child]:mb-0',
        '[&_p]:my-2 [&_p]:whitespace-pre-wrap',
        '[&_h1]:mb-2 [&_h1]:mt-4 [&_h1]:text-xl [&_h1]:font-semibold',
        '[&_h2]:mb-2 [&_h2]:mt-4 [&_h2]:text-lg [&_h2]:font-semibold',
        '[&_h3]:mb-1.5 [&_h3]:mt-3 [&_h3]:text-base [&_h3]:font-semibold',
        '[&_h4]:mb-1 [&_h4]:mt-3 [&_h4]:font-semibold',
        '[&_ul]:my-2 [&_ul]:list-disc [&_ul]:pl-5',
        '[&_ol]:my-2 [&_ol]:list-decimal [&_ol]:pl-5 [&_li]:my-0.5',
        '[&_blockquote]:my-3 [&_blockquote]:border-l-2 [&_blockquote]:border-current/30 [&_blockquote]:pl-3 [&_blockquote]:opacity-80',
        '[&_hr]:my-4 [&_hr]:border-current/20',
        '[&_a]:font-medium [&_a]:underline [&_a]:underline-offset-4',
        '[&_code]:rounded [&_code]:bg-muted/70 [&_code]:px-1 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-[0.85em]',
        '[&_pre]:my-3 [&_pre]:max-w-full [&_pre]:overflow-x-auto [&_pre]:rounded-lg [&_pre]:bg-muted/70 [&_pre]:p-3',
        '[&_pre_code]:bg-transparent [&_pre_code]:p-0 [&_pre_code]:text-xs',
        '[&_table]:my-3 [&_table]:w-full [&_table]:border-collapse [&_table]:text-left [&_table]:text-xs',
        '[&_th]:border [&_th]:border-current/20 [&_th]:bg-muted/40 [&_th]:px-2 [&_th]:py-1.5 [&_th]:font-medium',
        '[&_td]:border [&_td]:border-current/20 [&_td]:px-2 [&_td]:py-1.5',
        '[&_input[type=checkbox]]:mr-1.5',
        className,
      )}
      data-agent-box-markdown=""
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({ children: linkChildren, ...props }) => (
            <a {...props} target="_blank" rel="noopener noreferrer">
              {linkChildren}
            </a>
          ),
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  )
}
