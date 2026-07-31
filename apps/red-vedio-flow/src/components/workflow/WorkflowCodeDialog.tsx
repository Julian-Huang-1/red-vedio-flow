import { useEffect, useState } from 'react'
import { Check, Copy, LoaderCircle, X } from 'lucide-react'
import { fetchGeneratedWorkflowModule } from '@red-video-flow/workflow-client'
import { Button } from '@/components/ui/button'
import { persistCurrentWorkflow } from '@/lib/workflowPersistence'

type WorkflowCodeDialogProps = {
  open: boolean
  workflowId: string
  subgraphId?: string
  title?: string
  onOpenChange: (open: boolean) => void
}

export function WorkflowCodeDialog({
  open,
  workflowId,
  subgraphId,
  title = '工作流代码',
  onOpenChange,
}: WorkflowCodeDialogProps) {
  const [language, setLanguage] = useState<'js' | 'ts'>('ts')
  const [code, setCode] = useState('')
  const [error, setError] = useState<string>()
  const [loading, setLoading] = useState(false)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (!open) {
      setCopied(false)
      return
    }
    let active = true
    setLoading(true)
    setError(undefined)
    void persistCurrentWorkflow()
      .then(() => fetchGeneratedWorkflowModule(workflowId, language, subgraphId))
      .then((generated) => {
        if (active) setCode(generated.code)
      })
      .catch((reason) => {
        if (active) {
          setCode('')
          setError(reason instanceof Error ? reason.message : String(reason))
        }
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [language, open, subgraphId, workflowId])

  if (!open) return null

  const copyCode = async () => {
    if (!code) return
    await navigator.clipboard.writeText(code)
    setCopied(true)
  }

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/45 p-4"
      role="presentation"
      data-workflow-code-dialog-overlay=""
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onOpenChange(false)
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="flex h-[min(760px,88vh)] w-[min(1000px,94vw)] flex-col overflow-hidden rounded-2xl border bg-background shadow-2xl"
        data-workflow-code-dialog=""
      >
        <header className="flex h-14 shrink-0 items-center justify-between border-b px-4">
          <div>
            <h2 className="text-sm font-semibold">{title}</h2>
            <p className="text-xs text-muted-foreground">由子图内部拓扑和 Composer 配置生成</p>
          </div>
          <div className="flex items-center gap-1">
            <div className="mr-2 flex rounded-lg bg-muted p-0.5">
              {(['ts', 'js'] as const).map((item) => (
                <Button
                  key={item}
                  type="button"
                  variant={language === item ? 'secondary' : 'ghost'}
                  size="sm"
                  className="h-7 px-2.5 uppercase"
                  onClick={() => {
                    setCopied(false)
                    setLanguage(item)
                  }}
                >
                  {item}
                </Button>
              ))}
            </div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={!code || loading}
              onClick={() => void copyCode()}
            >
              {copied ? <Check size={16} /> : <Copy size={16} />}
              {copied ? '已复制' : '复制'}
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label="关闭工作流代码"
              onClick={() => onOpenChange(false)}
            >
              <X size={18} />
            </Button>
          </div>
        </header>
        {loading ? (
          <div className="grid min-h-0 flex-1 place-items-center text-sm text-muted-foreground">
            <span className="flex items-center gap-2">
              <LoaderCircle size={16} className="animate-spin" />
              正在生成代码…
            </span>
          </div>
        ) : error ? (
          <div className="grid min-h-0 flex-1 place-items-center p-6 text-sm text-destructive">
            {error}
          </div>
        ) : (
          <pre className="min-h-0 flex-1 overflow-auto bg-muted/30 p-5 text-xs leading-6">
            <code>{code}</code>
          </pre>
        )}
      </section>
    </div>
  )
}
