import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import {
  AppWindow,
  Check,
  Copy,
  ExternalLink,
  LoaderCircle,
  Plus,
  Workflow,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  fetchPublishedApps,
  publishedAppUrl,
  type PublishedApp,
} from '@/pages/app-builder/publishedAppClient'

export function HomePage() {
  const appsQuery = useQuery({ queryKey: ['published-apps'], queryFn: fetchPublishedApps })
  const [copiedAppId, setCopiedAppId] = useState<string>()
  const apps = appsQuery.data?.apps ?? []

  async function copyLink(app: PublishedApp) {
    await navigator.clipboard.writeText(publishedAppUrl(app.id))
    setCopiedAppId(app.id)
  }

  return (
    <main className="min-h-[calc(100vh-4rem)] bg-muted/20 px-6 py-8">
      <div className="mx-auto w-full max-w-7xl">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-muted-foreground">Home</p>
            <h1 className="mt-1 text-3xl font-semibold tracking-tight">我的应用</h1>
            <p className="mt-2 text-sm text-muted-foreground">查看和管理由 App Builder 发布的应用。</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" asChild>
              <Link to="/workflow"><Workflow size={16} />工作流</Link>
            </Button>
            <Button asChild>
              <Link to="/app-builder"><Plus size={16} />创建应用</Link>
            </Button>
          </div>
        </div>

        {appsQuery.isPending ? (
          <div className="grid min-h-72 place-items-center">
            <LoaderCircle className="size-6 animate-spin text-muted-foreground" />
          </div>
        ) : appsQuery.isError ? (
          <Card className="mt-8 border-destructive/30">
            <CardHeader>
              <CardTitle>应用列表加载失败</CardTitle>
              <CardDescription>{appsQuery.error.message}</CardDescription>
            </CardHeader>
            <CardFooter>
              <Button variant="outline" onClick={() => void appsQuery.refetch()}>重新加载</Button>
            </CardFooter>
          </Card>
        ) : apps.length === 0 ? (
          <Card className="mt-8 border-dashed">
            <CardContent className="flex min-h-72 flex-col items-center justify-center text-center">
              <div className="grid size-14 place-items-center rounded-2xl bg-muted">
                <AppWindow className="size-7 text-muted-foreground" />
              </div>
              <h2 className="mt-4 font-semibold">还没有发布应用</h2>
              <p className="mt-1 text-sm text-muted-foreground">使用 App Builder 生成页面并完成第一次发布。</p>
              <Button className="mt-5" asChild>
                <Link to="/app-builder"><Plus size={16} />创建应用</Link>
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="mt-8 grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
            {apps.map((app) => (
              <Card key={app.id} className="flex min-h-60 flex-col transition-shadow hover:shadow-md">
                <CardHeader>
                  <div className="flex items-start justify-between gap-3">
                    <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
                      <AppWindow size={20} />
                    </div>
                    <Badge variant={app.currentReleaseId ? 'default' : 'secondary'}>
                      {app.currentReleaseId ? '已发布' : '未发布'}
                    </Badge>
                  </div>
                  <CardTitle className="mt-3 truncate">{app.title}</CardTitle>
                  <CardDescription>更新于 {formatTime(app.updatedAt)}</CardDescription>
                </CardHeader>
                <CardContent className="flex-1">
                  <p className="truncate font-mono text-xs text-muted-foreground">{app.id}</p>
                </CardContent>
                <CardFooter className="gap-2">
                  <Button
                    className="flex-1"
                    disabled={!app.currentReleaseId}
                    onClick={() => window.open(
                      publishedAppUrl(app.id),
                      '_blank',
                      'noopener,noreferrer',
                    )}
                  >
                    <ExternalLink size={15} />打开应用
                  </Button>
                  <Button
                    variant="outline"
                    size="icon"
                    disabled={!app.currentReleaseId}
                    aria-label={`复制 ${app.title} 的访问链接`}
                    onClick={() => void copyLink(app)}
                  >
                    {copiedAppId === app.id ? <Check size={16} /> : <Copy size={16} />}
                  </Button>
                </CardFooter>
              </Card>
            ))}
          </div>
        )}
      </div>
    </main>
  )
}

function formatTime(timestamp: number) {
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(timestamp)
}
