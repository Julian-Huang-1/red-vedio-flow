import { cn } from '@/lib/utils'
import type { PreviewMode } from './htmlArtifact'

const PREVIEW_WIDTHS: Record<PreviewMode, string> = {
  desktop: 'w-full',
  tablet: 'w-[768px] max-w-full',
  mobile: 'w-[390px] max-w-full',
}

type AppPreviewProps = {
  html: string
  mode: PreviewMode
  reloadKey: number
  title?: string
}

export function AppPreview({
  html,
  mode,
  reloadKey,
  title = '应用预览',
}: AppPreviewProps) {
  return (
    <div
      className="flex h-full min-h-0 justify-center overflow-auto bg-muted/40 p-4"
      data-app-preview-root=""
      data-preview-mode={mode}
    >
      <iframe
        key={reloadKey}
        title={title}
        srcDoc={html}
        sandbox="allow-scripts"
        referrerPolicy="no-referrer"
        className={cn(
          'h-full min-h-[480px] rounded-xl border bg-white shadow-sm transition-[width] duration-200',
          PREVIEW_WIDTHS[mode],
        )}
        data-app-preview-frame=""
      />
    </div>
  )
}
