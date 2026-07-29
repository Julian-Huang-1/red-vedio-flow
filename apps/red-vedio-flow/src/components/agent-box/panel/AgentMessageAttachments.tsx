import { File, Image } from 'lucide-react'
import type { AgentAttachment } from '../agentBoxTypes'

export function AgentMessageAttachments({
  attachments,
}: {
  attachments: AgentAttachment[]
}) {
  if (!attachments.length) return null

  return (
    <div
      className="mt-2 flex flex-wrap gap-1.5"
      data-agent-box-message-attachments=""
    >
      {attachments.map((attachment) => {
        const Icon = attachment.mimeType.startsWith('image/') ? Image : File
        return (
          <span
            key={attachment.id}
            className="inline-flex max-w-full items-center gap-1.5 rounded-md border bg-background/60 px-2 py-1 text-[11px]"
            data-agent-box-message-attachment=""
          >
            <Icon size={12} className="shrink-0" />
            <span className="max-w-40 truncate">{attachment.name}</span>
            <span className="shrink-0 text-muted-foreground">
              {formatFileSize(attachment.size)}
            </span>
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
