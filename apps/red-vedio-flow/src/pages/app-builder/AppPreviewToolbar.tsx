import {
  Code2,
  Monitor,
  RefreshCw,
  Smartphone,
  Tablet,
  Upload,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { PreviewMode } from './htmlArtifact'

const MODES = [
  { value: 'desktop', label: '桌面', icon: Monitor },
  { value: 'tablet', label: '平板', icon: Tablet },
  { value: 'mobile', label: '手机', icon: Smartphone },
] as const

type AppPreviewToolbarProps = {
  mode: PreviewMode
  hasArtifact: boolean
  title?: string
  version?: number
  onModeChange: (mode: PreviewMode) => void
  onReload: () => void
  onSourceOpen: () => void
  onPublish: () => void
  publishing?: boolean
}

export function AppPreviewToolbar({
  mode,
  hasArtifact,
  title,
  version,
  onModeChange,
  onReload,
  onSourceOpen,
  onPublish,
  publishing,
}: AppPreviewToolbarProps) {
  return (
    <div
      className="flex min-h-12 flex-wrap items-center justify-between gap-3 border-b px-3 py-1.5"
      data-app-preview-toolbar=""
    >
      <div className="min-w-0">
        <p className="truncate text-sm font-medium">{title || 'App Builder'}</p>
        <p className="hidden text-xs text-muted-foreground sm:block">
          {version ? `内存版本 v${version}` : '尚未生成页面'}
        </p>
      </div>

      <div className="flex items-center gap-1">
        <Button
          type="button"
          size="sm"
          className="mr-1 h-8 gap-1.5"
          disabled={!hasArtifact || publishing}
          onClick={onPublish}
        >
          <Upload size={15} />
          {publishing ? '发布中…' : '发布'}
        </Button>
        <div className="flex items-center rounded-lg border bg-muted/40 p-1">
          {MODES.map(({ value, label, icon: Icon }) => (
            <Button
              key={value}
              type="button"
              variant="ghost"
              size="sm"
              className={cn(
                'h-8 gap-1.5 px-2.5 text-xs',
                mode === value && 'bg-background shadow-sm hover:bg-background',
              )}
              aria-pressed={mode === value}
              onClick={() => onModeChange(value)}
            >
              <Icon size={15} />
              <span className="hidden sm:inline">{label}</span>
            </Button>
          ))}
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-8"
          disabled={!hasArtifact}
          aria-label="刷新预览"
          onClick={onReload}
        >
          <RefreshCw size={16} />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-8"
          disabled={!hasArtifact}
          aria-label="查看源码"
          onClick={onSourceOpen}
        >
          <Code2 size={17} />
        </Button>
      </div>
    </div>
  )
}
