import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { Check, Copy, LoaderCircle, X } from 'lucide-react'
import type { NodeRun, NodeRunTrace } from '@red-video-flow/workflow-core'
import { fetchWorkflowNodeRun } from '@red-video-flow/workflow-client'
import { Button } from '@/components/ui/button'

type DebugTab = 'composer' | 'provider' | 'network' | 'response'

export function NodeDebugDrawer({
  open,
  runId,
  nodeTitle,
  onOpenChange,
}: {
  open: boolean
  runId?: string
  nodeTitle: string
  onOpenChange: (open: boolean) => void
}) {
  const [run, setRun] = useState<NodeRun>()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string>()
  const [tab, setTab] = useState<DebugTab>('network')
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (!open || !runId) return
    let active = true
    setLoading(true)
    setError(undefined)
    setCopied(false)
    void fetchWorkflowNodeRun(runId)
      .then(({ run: nextRun }) => {
        if (active) setRun(nextRun)
      })
      .catch((reason) => {
        if (active) setError(reason instanceof Error ? reason.message : String(reason))
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [open, runId])

  const content = useMemo(() => traceTabContent(run?.trace, tab), [run?.trace, tab])
  if (!open) return null

  return createPortal((
    <div className="fixed inset-0 z-50 bg-black/25" role="presentation">
      <button
        type="button"
        className="absolute inset-0 cursor-default"
        aria-label="关闭节点调试面板"
        onClick={() => onOpenChange(false)}
      />
      <aside
        className="absolute inset-y-0 right-0 flex w-[min(680px,92vw)] flex-col border-l bg-background shadow-2xl"
        role="dialog"
        aria-modal="true"
        aria-label="节点调试信息"
        data-workflow-node-debug-drawer=""
      >
        <header className="flex h-14 shrink-0 items-center justify-between border-b px-4">
          <div className="min-w-0">
            <h2 className="truncate text-sm font-semibold">节点 Debug</h2>
            <p className="truncate text-xs text-muted-foreground">{nodeTitle} · {runId ?? '暂无运行'}</p>
          </div>
          <Button type="button" variant="ghost" size="icon" onClick={() => onOpenChange(false)}>
            <X size={18} />
          </Button>
        </header>

        {run?.trace ? (
          <div className="grid grid-cols-2 gap-x-5 gap-y-1 border-b px-4 py-3 text-xs">
            <span className="text-muted-foreground">Provider</span>
            <span>{run.trace.providerId}</span>
            <span className="text-muted-foreground">Model</span>
            <span>{run.trace.modelId}</span>
            <span className="text-muted-foreground">状态 / 耗时</span>
            <span>{run.status} · {run.trace.durationMs === undefined ? '执行中' : `${run.trace.durationMs} ms`}</span>
          </div>
        ) : null}

        <div className="flex items-center gap-1 border-b px-3 py-2">
          {([
            ['composer', 'Composer'],
            ['provider', 'Provider 输入'],
            ['network', '最终请求'],
            ['response', '模型响应'],
          ] as const).map(([value, label]) => (
            <Button
              key={value}
              type="button"
              size="sm"
              variant={tab === value ? 'secondary' : 'ghost'}
              onClick={() => {
                setTab(value)
                setCopied(false)
              }}
            >
              {label}
            </Button>
          ))}
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="ml-auto"
            disabled={!content}
            onClick={async () => {
              await navigator.clipboard.writeText(content)
              setCopied(true)
            }}
          >
            {copied ? <Check size={14} /> : <Copy size={14} />}
            {copied ? '已复制' : '复制 JSON'}
          </Button>
        </div>

        {loading ? (
          <div className="grid flex-1 place-items-center text-sm text-muted-foreground">
            <span className="flex items-center gap-2"><LoaderCircle size={16} className="animate-spin" />加载 Trace…</span>
          </div>
        ) : error ? (
          <div className="grid flex-1 place-items-center p-6 text-sm text-destructive">{error}</div>
        ) : !run?.trace ? (
          <div className="grid flex-1 place-items-center p-6 text-sm text-muted-foreground">
            这次运行没有 Trace；请重新执行节点后查看。
          </div>
        ) : (
          <pre className="min-h-0 flex-1 overflow-auto bg-muted/25 p-4 text-xs leading-5">
            <code>{content}</code>
          </pre>
        )}
      </aside>
    </div>
  ), document.body)
}

function traceTabContent(trace: NodeRunTrace | undefined, tab: DebugTab) {
  if (!trace) return ''
  const value = tab === 'composer'
    ? trace.composer
    : tab === 'provider'
      ? trace.providerInput ?? trace.resolvedRequest
      : tab === 'network'
        ? trace.networkRequests
      : {
          response: trace.response,
          error: trace.error,
        }
  return JSON.stringify(value ?? null, null, 2)
}
