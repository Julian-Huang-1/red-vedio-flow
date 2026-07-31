import { useEffect, useState } from 'react'
import {
  Blocks,
  Check,
  CircleCheck,
  Copy,
  ExternalLink,
  LoaderCircle,
  Sparkles,
  TriangleAlert,
} from 'lucide-react'
import {
  selectActiveSession,
  useAgentBoxStore,
} from '@/components/agent-box'
import { Button } from '@/components/ui/button'
import { AppPreview } from './AppPreview'
import { AppPreviewToolbar } from './AppPreviewToolbar'
import { AppSourceDialog } from './AppSourceDialog'
import { useAppBuilderStore } from './appBuilderStore'
import { useWorkflowStore } from '@/stores/workflowStore'
import {
  bindDefaultCapability,
  createPublishedApp,
  publishedAppUrl,
  publishAppRelease,
} from './publishedAppClient'

export function AppBuilderPage() {
  const activeSession = useAgentBoxStore(selectActiveSession)
  const selectAgent = useAgentBoxStore((state) => state.selectAgent)
  const openDrawer = useAgentBoxStore((state) => state.openDrawer)
  const activeSessionId = activeSession?.id
  const artifact = useAppBuilderStore((state) =>
    activeSessionId ? state.artifactsBySessionId[activeSessionId] : undefined)
  const generating = useAppBuilderStore((state) =>
    Boolean(activeSessionId && state.generatingSessionId === activeSessionId))
  const generationError = useAppBuilderStore((state) =>
    activeSessionId ? state.generationErrorsBySessionId[activeSessionId] : undefined)
  const previewMode = useAppBuilderStore((state) => state.previewMode)
  const sourceOpen = useAppBuilderStore((state) => state.sourceOpen)
  const reloadKey = useAppBuilderStore((state) => state.reloadKey)
  const setPreviewMode = useAppBuilderStore((state) => state.setPreviewMode)
  const setSourceOpen = useAppBuilderStore((state) => state.setSourceOpen)
  const reloadPreview = useAppBuilderStore((state) => state.reloadPreview)
  const workflowId = useWorkflowStore((state) => state.workflowId)
  const workflowRevision = useWorkflowStore((state) => state.revision)
  const [publishing, setPublishing] = useState(false)
  const [publishError, setPublishError] = useState<string>()
  const [published, setPublished] = useState<{ appId: string; version: number }>()
  const [copied, setCopied] = useState(false)

  async function publishArtifact() {
    if (!artifact || publishing) return
    setPublishing(true)
    setPublishError(undefined)
    setPublished(undefined)
    setCopied(false)
    try {
      if (workflowId === 'default' || workflowRevision <= 0) {
        throw new Error('请先在画布中选择并保存一个工作流，用作应用的 default 服务端能力。')
      }
      const storageKey = `published-app:${artifact.id}`
      let appId = window.localStorage.getItem(storageKey)
      if (!appId) {
        const created = await createPublishedApp(artifact.title)
        appId = created.app.id
        window.localStorage.setItem(storageKey, appId)
      }
      const result = await publishAppRelease(appId, {
        title: artifact.title,
        html: artifact.html,
      })
      await bindDefaultCapability(appId, workflowId, workflowRevision)
      setPublished({ appId, version: result.release.version })
    } catch (error) {
      setPublishError(error instanceof Error ? error.message : String(error))
    } finally {
      setPublishing(false)
    }
  }

  function publishedPath(appId: string) {
    return publishedAppUrl(appId)
  }

  async function copyPublishedLink(appId: string) {
    try {
      await navigator.clipboard.writeText(
        publishedPath(appId),
      )
      setCopied(true)
    } catch {
      setPublishError('复制链接失败，请点击“打开应用”后复制浏览器地址。')
    }
  }

  useEffect(() => {
    selectAgent('app-builder-agent')
  }, [selectAgent])

  return (
    <main className="h-[calc(100vh-4rem)] w-full bg-muted/20 p-4">
      <section
        className="flex h-full min-h-0 flex-col overflow-hidden rounded-2xl border bg-card shadow-sm"
        data-app-builder-page=""
        data-generating={generating ? '' : undefined}
      >
        <AppPreviewToolbar
          mode={previewMode}
          hasArtifact={Boolean(artifact)}
          title={artifact?.title}
          version={artifact?.version}
          onModeChange={setPreviewMode}
          onReload={reloadPreview}
          onSourceOpen={() => setSourceOpen(true)}
          onPublish={() => void publishArtifact()}
          publishing={publishing}
        />

        <div className="relative min-h-0 flex-1">
          {artifact ? (
            <AppPreview
              html={artifact.html}
              mode={previewMode}
              reloadKey={reloadKey}
              title={artifact.title}
            />
          ) : (
            <div className="grid h-full place-items-center p-6" data-app-builder-empty="">
              <div className="max-w-md text-center">
                <div className="mx-auto grid size-14 place-items-center rounded-2xl bg-muted">
                  <Blocks className="size-7 text-muted-foreground" />
                </div>
                <h1 className="mt-5 text-2xl font-semibold tracking-tight">
                  用 Agent 创建一个应用
                </h1>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">
                  描述你想要的页面。Agent 会生成一份完整的单文件 HTML，并在本轮完成后更新预览。
                </p>
                <Button className="mt-5" onClick={openDrawer}>
                  <Sparkles size={16} />
                  打开 Agent
                </Button>
              </div>
            </div>
          )}

          {generating ? (
            <div
              className="absolute inset-x-0 top-0 flex items-center justify-center bg-background/90 px-4 py-2 text-sm shadow-sm backdrop-blur"
              data-app-builder-generating=""
            >
              <LoaderCircle className="mr-2 size-4 animate-spin" />
              Agent 正在生成，新版本将在本轮完成后更新
            </div>
          ) : null}

          {generationError && !generating ? (
            <div
              className="absolute inset-x-4 bottom-4 mx-auto flex max-w-xl items-start gap-2 rounded-xl border border-destructive/30 bg-background/95 px-4 py-3 text-sm shadow-lg backdrop-blur"
              role="status"
              data-app-builder-error=""
            >
              <TriangleAlert className="mt-0.5 size-4 shrink-0 text-destructive" />
              <span>{generationError}</span>
            </div>
          ) : null}
          {publishError ? (
            <div className="absolute inset-x-4 bottom-4 mx-auto max-w-xl rounded-xl border border-destructive/30 bg-background/95 px-4 py-3 text-sm shadow-lg">
              发布失败：{publishError}
            </div>
          ) : null}
          {published && !publishError ? (
            <div
              className="absolute inset-x-4 bottom-4 mx-auto flex max-w-xl flex-wrap items-center gap-3 rounded-xl border border-emerald-500/30 bg-background/95 px-4 py-3 text-sm shadow-lg backdrop-blur"
              role="status"
              data-app-published=""
            >
              <CircleCheck className="size-5 shrink-0 text-emerald-600" />
              <div className="min-w-0 flex-1">
                <p className="font-medium">发布成功</p>
                <p className="text-xs text-muted-foreground">当前发布版本 v{published.version}</p>
              </div>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => void copyPublishedLink(published.appId)}
              >
                {copied ? <Check size={15} /> : <Copy size={15} />}
                {copied ? '已复制' : '复制链接'}
              </Button>
              <Button
                type="button"
                size="sm"
                onClick={() => window.open(
                  publishedPath(published.appId),
                  '_blank',
                  'noopener,noreferrer',
                )}
              >
                <ExternalLink size={15} />
                打开应用
              </Button>
            </div>
          ) : null}
        </div>
      </section>

      <AppSourceDialog
        open={sourceOpen && Boolean(artifact)}
        html={artifact?.html ?? ''}
        onOpenChange={setSourceOpen}
      />
    </main>
  )
}
