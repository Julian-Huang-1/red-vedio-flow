import { createFileRoute } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import {
  deleteModelCredential,
  fetchModelCredentialStatus,
  saveModelCredential,
} from '@red-video-flow/workflow-client'

export const Route = createFileRoute('/canvas/$workflowId/settings')({
  component: CanvasSettingsRoute,
})

function CanvasSettingsRoute() {
  const { workflowId } = Route.useParams()
  const [token, setToken] = useState('')
  const [maskedToken, setMaskedToken] = useState<string>()
  const [configured, setConfigured] = useState(false)
  const [busy, setBusy] = useState(true)
  const [message, setMessage] = useState('')

  useEffect(() => {
    void fetchModelCredentialStatus()
      .then((status) => {
        setConfigured(status.configured)
        setMaskedToken(status.maskedToken)
      })
      .catch((error: unknown) => setMessage(error instanceof Error ? error.message : String(error)))
      .finally(() => setBusy(false))
  }, [])

  async function save() {
    if (!token.trim()) return
    setBusy(true)
    setMessage('')
    try {
      const status = await saveModelCredential(token)
      setConfigured(status.configured)
      setMaskedToken(status.maskedToken)
      setToken('')
      setMessage('已加密保存。文本、图片和视频 Provider 将共用此 Token。')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error))
    } finally {
      setBusy(false)
    }
  }

  async function remove() {
    setBusy(true)
    try {
      await deleteModelCredential()
      setConfigured(false)
      setMaskedToken(undefined)
      setMessage('Token 已删除。')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error))
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="grid h-screen w-screen place-items-center bg-canvas px-6 text-white">
      <section className="w-full max-w-xl rounded-2xl border border-white/10 bg-zinc-950/80 p-7 shadow-2xl">
        <p className="text-xs uppercase tracking-[0.18em] text-zinc-500">画布 {workflowId}</p>
        <h1 className="mt-2 text-xl font-semibold">模型 API Token</h1>
        <p className="mt-2 text-sm leading-6 text-zinc-400">
          每个登录用户保存一份凭证，所有文本、图片和视频 Provider 共用。服务端只返回脱敏指纹。
        </p>
        <div className="mt-6 flex gap-3">
          <input
            type="password"
            autoComplete="new-password"
            value={token}
            disabled={busy}
            placeholder={configured ? `已配置 ${maskedToken ?? ''}，输入新值可覆盖` : '输入 API Token'}
            onChange={(event) => setToken(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') void save()
            }}
            className="min-w-0 flex-1 rounded-lg border border-white/10 bg-black/40 px-3 py-2.5 text-sm outline-none placeholder:text-zinc-600 focus:border-white/30"
          />
          <button
            disabled={busy || !token.trim()}
            onClick={() => void save()}
            className="rounded-lg bg-white px-4 py-2.5 text-sm font-medium text-black disabled:opacity-40"
          >
            {configured ? '覆盖保存' : '保存'}
          </button>
        </div>
        <div className="mt-4 flex min-h-8 items-center justify-between gap-4 text-sm">
          <span className={configured ? 'text-emerald-400' : 'text-zinc-500'}>
            {configured ? `已配置 ${maskedToken ?? ''}` : '尚未配置'}
          </span>
          {configured ? (
            <button disabled={busy} onClick={() => void remove()} className="text-red-400 disabled:opacity-40">
              删除 Token
            </button>
          ) : null}
        </div>
        {message ? <p className="mt-3 text-sm text-zinc-300">{message}</p> : null}
      </section>
    </main>
  )
}
