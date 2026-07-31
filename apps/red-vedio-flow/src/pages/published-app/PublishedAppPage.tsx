import { useEffect, useState } from 'react'
import { LoaderCircle, TriangleAlert } from 'lucide-react'
import { createRuntimeSession } from '@/pages/app-builder/publishedAppClient'

export function PublishedAppPage({ appId }: { appId: string }) {
  const [runtimeUrl, setRuntimeUrl] = useState<string>()
  const [error, setError] = useState<string>()

  useEffect(() => {
    let active = true
    createRuntimeSession(appId)
      .then((result) => {
        if (active) setRuntimeUrl(result.runtimeUrl)
      })
      .catch((cause) => {
        if (active) setError(cause instanceof Error ? cause.message : String(cause))
      })
    return () => { active = false }
  }, [appId])

  if (error) {
    return (
      <main className="grid h-screen place-items-center p-6">
        <div className="flex max-w-lg items-start gap-3 rounded-xl border p-5 text-sm">
          <TriangleAlert className="mt-0.5 size-5 text-destructive" />
          <div><p className="font-medium">应用加载失败</p><p className="mt-1 text-muted-foreground">{error}</p></div>
        </div>
      </main>
    )
  }

  if (!runtimeUrl) {
    return (
      <main className="grid h-screen place-items-center">
        <LoaderCircle className="size-6 animate-spin" />
      </main>
    )
  }

  return (
    <main className="h-screen bg-muted/20 p-3">
      <iframe
        title="Published application"
        src={runtimeUrl}
        className="h-full w-full rounded-xl border bg-background shadow-sm"
        sandbox="allow-scripts allow-forms allow-same-origin allow-downloads"
        referrerPolicy="no-referrer"
      />
    </main>
  )
}
