import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import {
  AppWindow,
  Check,
  Copy,
  ExternalLink,
  LoaderCircle,
  Plus,
  Trash2,
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
  deletePublishedApp,
  publishedAppUrl,
  publishedAppPreviewUrl,
  type PublishedApp,
} from '@/pages/app-builder/publishedAppClient'

export function HomePage() {
  const queryClient = useQueryClient()
  const [copiedAppId, setCopiedAppId] = useState<string>()
  const [filter, setFilter] = useState<'mine' | 'all'>('mine')
  const appsQuery = useQuery({
    queryKey: ['published-apps', filter],
    queryFn: () => fetchPublishedApps(filter),
  })
  const apps = appsQuery.data?.apps ?? []
  const deleteMutation = useMutation({
    mutationFn: deletePublishedApp,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['published-apps'] }),
  })

  async function copyLink(app: PublishedApp) {
    await navigator.clipboard.writeText(publishedAppUrl(app.id))
    setCopiedAppId(app.id)
  }

  function removeApp(app: PublishedApp) {
    if (window.confirm(`确定删除“${app.title}”吗？删除后无法恢复。`)) {
      deleteMutation.mutate(app.id)
    }
  }

  return (
    <main className="min-h-screen bg-muted/20 px-4 pb-8 pt-20 sm:px-6 sm:pt-24">
      <div className="mx-auto w-full max-w-7xl">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="mt-1 text-3xl font-semibold tracking-tight">应用</h1>
          </div>
        </div>

        <div className="mt-5 flex w-fit rounded-lg bg-muted p-1" aria-label="应用筛选">
          <Button
            variant={filter === 'mine' ? 'secondary' : 'ghost'}
            size="sm"
            className="h-7 px-3"
            onClick={() => setFilter('mine')}
          >
            自己
          </Button>
          <Button
            variant={filter === 'all' ? 'secondary' : 'ghost'}
            size="sm"
            className="h-7 px-3"
            onClick={() => setFilter('all')}
          >
            全部
          </Button>
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
              <h2 className="mt-4 font-semibold">
                {filter === 'mine' ? '你还没有发布应用' : '还没有发布应用'}
              </h2>
              {filter === 'mine' && (
                <>
                  <p className="mt-1 text-sm text-muted-foreground">使用 App Builder 生成页面并完成第一次发布。</p>
                  <Button className="mt-5" asChild>
                    <Link to="/app-builder"><Plus size={16} />创建应用</Link>
                  </Button>
                </>
              )}
            </CardContent>
          </Card>
        ) : (
          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
            {apps.map((app) => (
              <Card key={app.id} className="flex flex-col transition-shadow hover:shadow-md">
                <div
                  role="link"
                  tabIndex={app.currentReleaseId ? 0 : -1}
                  className="relative aspect-video w-full overflow-hidden rounded-t-xl border-b bg-muted text-left"
                  aria-label={`打开 ${app.title}`}
                  onClick={() => {
                    if (app.currentReleaseId) {
                      window.open(publishedAppUrl(app.id), '_blank', 'noopener,noreferrer')
                    }
                  }}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' && app.currentReleaseId) {
                      window.open(publishedAppUrl(app.id), '_blank', 'noopener,noreferrer')
                    }
                  }}
                >
                  {app.currentReleaseId ? (
                    <iframe
                      src={publishedAppPreviewUrl(app.id)}
                      title={`${app.title} 缩略图`}
                      sandbox=""
                      loading="lazy"
                      tabIndex={-1}
                      className="pointer-events-none absolute left-0 top-0 h-[400%] w-[400%] origin-top-left scale-[0.25] border-0 bg-white"
                    />
                  ) : (
                    <span className="grid h-full place-items-center text-sm text-muted-foreground">暂无预览</span>
                  )}
                </div>
                <CardHeader className="p-4 pb-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="grid size-8 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
                      <AppWindow size={17} />
                    </div>
                    <Badge variant={app.currentReleaseId ? 'default' : 'secondary'}>
                      {app.currentReleaseId ? '已发布' : '未发布'}
                    </Badge>
                  </div>
                  <CardTitle className="mt-2 truncate text-base">{app.title}</CardTitle>
                </CardHeader>
                <CardFooter className="gap-2 p-4 pt-0">
                  <Button
                    className="h-8 flex-1"
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
                    className="size-8"
                    disabled={!app.currentReleaseId}
                    aria-label={`复制 ${app.title} 的访问链接`}
                    onClick={() => void copyLink(app)}
                  >
                    {copiedAppId === app.id ? <Check size={16} /> : <Copy size={16} />}
                  </Button>
                  {app.isOwner && (
                    <Button
                      variant="outline"
                      size="icon"
                      className="size-8 text-destructive hover:text-destructive"
                      disabled={deleteMutation.isPending && deleteMutation.variables === app.id}
                      aria-label={`删除 ${app.title}`}
                      onClick={() => removeApp(app)}
                    >
                      {deleteMutation.isPending && deleteMutation.variables === app.id
                        ? <LoaderCircle className="animate-spin" size={16} />
                        : <Trash2 size={16} />}
                    </Button>
                  )}
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
