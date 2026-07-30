import { useEffect } from 'react'
import { Blocks, LoaderCircle, Sparkles, TriangleAlert } from 'lucide-react'
import {
  selectActiveSession,
  useAgentBoxStore,
} from '@/components/agent-box'
import { Button } from '@/components/ui/button'
import { AppPreview } from './AppPreview'
import { AppPreviewToolbar } from './AppPreviewToolbar'
import { AppSourceDialog } from './AppSourceDialog'
import { useAppBuilderStore } from './appBuilderStore'

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
