import { File, FileText, Image, Video } from 'lucide-react'
import type { AgentAttachment, AgentResourceReference } from '../agentBoxTypes'

export function AgentMessageAttachments({
  attachments,
  resources = [],
}: {
  attachments: AgentAttachment[]
  resources?: AgentResourceReference[]
}) {
  if (!attachments.length && !resources.length) return null

  return (
    <div
      className="mt-2 flex min-w-0 max-w-full flex-wrap gap-1.5 overflow-hidden"
      data-agent-box-message-attachments=""
    >
      {attachments.map((attachment) => {
        const Icon = attachment.mimeType.startsWith('image/') ? Image : File
        return (
          <span
            key={attachment.id}
            className="inline-flex min-w-0 max-w-full items-center gap-1.5 rounded-md border bg-background/60 px-2 py-1 text-[11px]"
            data-agent-box-message-attachment=""
          >
            <Icon size={12} className="shrink-0" />
            <span className="min-w-0 max-w-40 truncate">{attachment.name}</span>
            <span className="shrink-0 text-muted-foreground">
              {formatFileSize(attachment.size)}
            </span>
          </span>
        )
      })}
      {resources.map((resource) => {
        const Icon = resource.kind === 'image'
          ? Image
          : resource.kind === 'video'
            ? Video
            : resource.kind === 'text' ? FileText : File
        return (
          <span
            key={resource.id}
            className="inline-flex min-w-0 max-w-full items-center gap-1.5 rounded-md border bg-background/60 px-2 py-1 text-[11px]"
            data-agent-box-message-resource=""
          >
            <Icon size={12} className="shrink-0" />
            <span className="min-w-0 max-w-40 truncate">{resource.name}</span>
            <span className="shrink-0 text-muted-foreground">画布资源</span>
          </span>
        )
      })}
    </div>
  )
}

function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}
