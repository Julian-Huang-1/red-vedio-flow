import { useEffect, useState } from 'react'
import { Check, Copy, X } from 'lucide-react'
import { Button } from '@/components/ui/button'

type AppSourceDialogProps = {
  open: boolean
  html: string
  onOpenChange: (open: boolean) => void
}

export function AppSourceDialog({
  open,
  html,
  onOpenChange,
}: AppSourceDialogProps) {
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (!open) setCopied(false)
  }, [open])

  if (!open) return null

  const copySource = async () => {
    await navigator.clipboard.writeText(html)
    setCopied(true)
  }

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/45 p-4"
      role="presentation"
      data-app-source-dialog-overlay=""
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onOpenChange(false)
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-label="HTML 源码"
        className="flex h-[min(760px,88vh)] w-[min(960px,94vw)] flex-col overflow-hidden rounded-2xl border bg-background shadow-2xl"
        data-app-source-dialog=""
      >
        <header className="flex h-14 shrink-0 items-center justify-between border-b px-4">
          <div>
            <h2 className="text-sm font-semibold">HTML 源码</h2>
            <p className="text-xs text-muted-foreground">当前内存版本，只读</p>
          </div>
          <div className="flex items-center gap-1">
            <Button type="button" variant="ghost" size="sm" onClick={copySource}>
              {copied ? <Check size={16} /> : <Copy size={16} />}
              {copied ? '已复制' : '复制'}
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label="关闭源码"
              onClick={() => onOpenChange(false)}
            >
              <X size={18} />
            </Button>
          </div>
        </header>
        <pre className="min-h-0 flex-1 overflow-auto bg-muted/30 p-5 text-xs leading-6">
          <code>{html}</code>
        </pre>
      </section>
    </div>
  )
}
