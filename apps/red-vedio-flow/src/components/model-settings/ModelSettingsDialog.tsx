import { useEffect, useState } from 'react'
import {
  deleteModelCredential,
  fetchModelCredentialStatus,
  saveModelCredential,
} from '@red-video-flow/workflow-client'
import {
  CheckCircle2,
  Eye,
  EyeOff,
  KeyRound,
  LoaderCircle,
  ShieldCheck,
  Trash2,
  X,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

type ModelSettingsDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function ModelSettingsDialog({
  open,
  onOpenChange,
}: ModelSettingsDialogProps) {
  const [token, setToken] = useState('')
  const [maskedToken, setMaskedToken] = useState<string>()
  const [configured, setConfigured] = useState(false)
  const [showToken, setShowToken] = useState(false)
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState<string>()
  const [error, setError] = useState<string>()

  useEffect(() => {
    if (!open) {
      setToken('')
      setShowToken(false)
      setMessage(undefined)
      setError(undefined)
      return
    }
    let active = true
    setLoading(true)
    void fetchModelCredentialStatus()
      .then((status) => {
        if (!active) return
        setConfigured(status.configured)
        setMaskedToken(status.maskedToken)
      })
      .catch((reason) => {
        if (active) setError(errorMessage(reason))
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onOpenChange(false)
    }
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [onOpenChange, open])

  if (!open) return null

  const save = async () => {
    if (!token.trim()) return
    setLoading(true)
    setMessage(undefined)
    setError(undefined)
    try {
      const status = await saveModelCredential(token)
      setConfigured(status.configured)
      setMaskedToken(status.maskedToken)
      setToken('')
      setShowToken(false)
      setMessage('模型 API Token 已安全保存。')
    } catch (reason) {
      setError(errorMessage(reason))
    } finally {
      setLoading(false)
    }
  }

  const remove = async () => {
    setLoading(true)
    setMessage(undefined)
    setError(undefined)
    try {
      await deleteModelCredential()
      setConfigured(false)
      setMaskedToken(undefined)
      setToken('')
      setMessage('模型 API Token 已删除。')
    } catch (reason) {
      setError(errorMessage(reason))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/45 p-4 backdrop-blur-[2px]"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onOpenChange(false)
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-label="模型设置"
        className="w-full max-w-lg overflow-hidden rounded-2xl border bg-background shadow-2xl"
      >
        <header className="flex items-start justify-between border-b px-5 py-4">
          <div className="flex gap-3">
            <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-primary text-primary-foreground">
              <KeyRound size={17} />
            </span>
            <div>
              <h2 className="font-semibold">模型设置</h2>
              <p className="mt-0.5 text-sm text-muted-foreground">
                配置文本、图片和视频模型共用的访问凭证
              </p>
            </div>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label="关闭模型设置"
            onClick={() => onOpenChange(false)}
          >
            <X size={18} />
          </Button>
        </header>

        <div className="space-y-5 p-5">
          <div className="flex items-center justify-between rounded-xl border bg-muted/30 px-4 py-3">
            <div className="flex items-center gap-2.5">
              {configured ? (
                <CheckCircle2 size={18} className="text-emerald-600" />
              ) : (
                <ShieldCheck size={18} className="text-muted-foreground" />
              )}
              <div>
                <p className="text-sm font-medium">
                  {configured ? '凭证已配置' : '尚未配置凭证'}
                </p>
                <p className="text-xs text-muted-foreground">
                  {configured
                    ? maskedToken ?? '服务端已安全保存'
                    : '运行 Composer 前需要先保存 Token'}
                </p>
              </div>
            </div>
            {configured ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="text-destructive hover:text-destructive"
                disabled={loading}
                onClick={() => void remove()}
              >
                <Trash2 size={15} />
                删除
              </Button>
            ) : null}
          </div>

          <div className="space-y-2">
            <Label htmlFor="model-api-token">
              {configured ? '替换 API Token' : 'API Token'}
            </Label>
            <div className="relative">
              <Input
                id="model-api-token"
                type={showToken ? 'text' : 'password'}
                value={token}
                autoComplete="new-password"
                disabled={loading}
                placeholder={configured ? '输入新 Token 以覆盖当前凭证' : '输入模型 API Token'}
                className="pr-10"
                onChange={(event) => setToken(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') void save()
                }}
                autoFocus
              />
              <button
                type="button"
                className="absolute right-0 top-0 grid size-10 place-items-center text-muted-foreground hover:text-foreground"
                aria-label={showToken ? '隐藏 Token' : '显示 Token'}
                onClick={() => setShowToken((visible) => !visible)}
              >
                {showToken ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
            <p className="text-xs leading-5 text-muted-foreground">
              Token 由服务端加密保存，前端不会读取或展示完整内容。
            </p>
          </div>

          {message ? (
            <p className="rounded-lg bg-emerald-500/10 px-3 py-2 text-sm text-emerald-700">
              {message}
            </p>
          ) : null}
          {error ? (
            <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </p>
          ) : null}
        </div>

        <footer className="flex justify-end gap-2 border-t bg-muted/20 px-5 py-4">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            取消
          </Button>
          <Button
            type="button"
            disabled={loading || !token.trim()}
            onClick={() => void save()}
          >
            {loading ? <LoaderCircle size={16} className="animate-spin" /> : null}
            {configured ? '覆盖保存' : '保存 Token'}
          </Button>
        </footer>
      </section>
    </div>
  )
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error)
}
