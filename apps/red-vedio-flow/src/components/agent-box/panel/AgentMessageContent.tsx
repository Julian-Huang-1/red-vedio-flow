import {
  Archive,
  Brain,
  GitBranch,
  Info,
  Terminal,
  Wrench,
} from 'lucide-react'
import type { AgentMessage, AgentMessageContent as ContentBlock } from '../agentBoxTypes'

export function AgentMessageContent({ message }: { message: AgentMessage }) {
  const content = message.content?.length
    ? message.content
    : message.text
      ? [{ type: 'text' as const, text: message.text }]
      : []

  if (message.role === 'toolResult') {
    return (
      <SystemCard
        icon={<Wrench size={14} />}
        title={message.status === 'streaming'
          ? `${message.toolName || '工具'}执行中`
          : `${message.toolName || '工具'}执行${message.isError ? '失败' : '完成'}`}
        tone={message.isError ? 'error' : 'default'}
      >
        <ContentBlocks content={content} />
        {message.details !== undefined ? <JsonBlock value={message.details} /> : null}
      </SystemCard>
    )
  }

  if (message.role === 'bashExecution') {
    return (
      <SystemCard
        icon={<Terminal size={14} />}
        title={message.cancelled ? '命令已取消' : `命令退出码 ${message.exitCode ?? '—'}`}
        tone={message.status === 'error' ? 'error' : 'default'}
      >
        {message.command ? <code className="block break-all text-xs">$ {message.command}</code> : null}
        {message.text ? <pre className="mt-2 overflow-x-auto whitespace-pre-wrap text-xs">{message.text}</pre> : null}
        {message.truncated ? <p className="mt-2 text-xs text-muted-foreground">输出已截断</p> : null}
      </SystemCard>
    )
  }

  if (message.role === 'custom') {
    return (
      <SystemCard icon={<Info size={14} />} title={message.customType || '扩展消息'}>
        <ContentBlocks content={content} />
        {message.details !== undefined ? <JsonBlock value={message.details} /> : null}
      </SystemCard>
    )
  }

  if (message.role === 'branchSummary') {
    return (
      <SystemCard icon={<GitBranch size={14} />} title="分支摘要">
        <ContentBlocks content={content} />
      </SystemCard>
    )
  }

  if (message.role === 'compactionSummary') {
    return (
      <SystemCard
        icon={<Archive size={14} />}
        title={`上下文压缩${message.tokensBefore ? ` · ${message.tokensBefore} tokens` : ''}`}
      >
        <ContentBlocks content={content} />
      </SystemCard>
    )
  }

  return (
    <>
      <ContentBlocks content={content} />
      {message.errorMessage ? (
        <p className="mt-2 whitespace-pre-wrap text-xs text-destructive">
          {message.errorMessage}
        </p>
      ) : null}
    </>
  )
}

function ContentBlocks({ content }: { content: ContentBlock[] }) {
  return (
    <>
      {content.map((block, index) => {
        if (block.type === 'text') {
          return <div key={index} className="whitespace-pre-wrap">{block.text}</div>
        }
        if (block.type === 'thinking') {
          return (
            <details key={index} className="my-2 rounded-lg border bg-muted/30 px-3 py-2 text-xs">
              <summary className="flex cursor-pointer items-center gap-1.5 font-medium text-muted-foreground">
                <Brain size={13} />
                {block.redacted ? '思考内容已隐藏' : '思考过程'}
              </summary>
              {!block.redacted ? (
                <div className="mt-2 whitespace-pre-wrap text-muted-foreground">{block.thinking}</div>
              ) : null}
            </details>
          )
        }
        if (block.type === 'toolCall') {
          return (
            <div key={block.id} className="my-2 rounded-lg border bg-muted/30 px-3 py-2 text-xs">
              <div className="flex items-center gap-1.5 font-medium">
                <Wrench size={13} />
                调用 {block.name}
              </div>
              <JsonBlock value={block.arguments} />
            </div>
          )
        }
        return (
          <img
            key={index}
            className="my-2 max-h-72 rounded-lg border object-contain"
            src={block.data.startsWith('data:')
              ? block.data
              : `data:${block.mimeType};base64,${block.data}`}
            alt="消息图片"
          />
        )
      })}
    </>
  )
}

function SystemCard({
  icon,
  title,
  tone = 'default',
  children,
}: {
  icon: React.ReactNode
  title: string
  tone?: 'default' | 'error'
  children: React.ReactNode
}) {
  return (
    <article
      className="rounded-xl border bg-muted/20 px-3 py-2.5 text-sm"
      data-agent-box-system-message=""
      data-error={tone === 'error' ? '' : undefined}
    >
      <header className={tone === 'error'
        ? 'mb-2 flex items-center gap-2 text-xs font-medium text-destructive'
        : 'mb-2 flex items-center gap-2 text-xs font-medium text-muted-foreground'}
      >
        {icon}
        {title}
      </header>
      {children}
    </article>
  )
}

function JsonBlock({ value }: { value: unknown }) {
  return (
    <pre className="mt-2 max-h-52 overflow-auto whitespace-pre-wrap break-all rounded bg-background/70 p-2 text-[11px] leading-5">
      {safeStringify(value)}
    </pre>
  )
}

function safeStringify(value: unknown) {
  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return String(value)
  }
}
