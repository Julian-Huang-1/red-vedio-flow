import type { AgentAttachment } from './agentBoxTypes'

export type PiAgentModelDto = {
  id: string
  provider: string
  modelId: string
  label: string
}

export type PiAgentSessionSummaryDto = {
  id: string
  title: string
  createdAt: number
  updatedAt: number
  messageCount: number
}

export type PiAgentMessageDto = {
  id: string
  role:
    | 'user'
    | 'assistant'
    | 'toolResult'
    | 'bashExecution'
    | 'custom'
    | 'branchSummary'
    | 'compactionSummary'
  text: string
  createdAt: number
  status: 'completed' | 'stopped' | 'error'
  content: Array<
    | { type: 'text'; text: string }
    | { type: 'thinking'; thinking: string; redacted?: boolean }
    | { type: 'image'; data: string; mimeType: string }
    | { type: 'toolCall'; id: string; name: string; arguments: unknown }
  >
  errorMessage?: string
  toolCallId?: string
  toolName?: string
  isError?: boolean
  details?: unknown
  command?: string
  exitCode?: number
  cancelled?: boolean
  truncated?: boolean
  customType?: string
  display?: boolean
  fromId?: string
  tokensBefore?: number
  attachments?: Array<{
    name: string
    mimeType: string
    size: number
  }>
}

export type PiAgentSessionDetailDto = PiAgentSessionSummaryDto & {
  messages: PiAgentMessageDto[]
  modelId?: string
}

export type PiAgentEvent =
  | { type: 'run-start'; runId: string }
  | { type: 'text-delta'; delta: string }
  | { type: 'thinking-delta'; delta: string }
  | {
      type: 'tool-start'
      toolCallId: string
      toolName: string
      args: unknown
    }
  | {
      type: 'tool-update'
      toolCallId: string
      toolName: string
      result: unknown
    }
  | {
      type: 'tool-end'
      toolCallId: string
      toolName: string
      result: unknown
      isError: boolean
    }
  | { type: 'run-end'; status: 'completed' | 'stopped' }
  | { type: 'error'; message: string }

export async function listPiAgentModels() {
  const response = await fetch('/api/pi-agent/models')
  if (!response.ok) throw new Error(await readError(response))
  const payload = await response.json() as { models: PiAgentModelDto[] }
  return payload.models
}

export async function listPiAgentSessions(query?: string) {
  const suffix = query?.trim() ? `?q=${encodeURIComponent(query.trim())}` : ''
  const response = await fetch(`/api/pi-agent/sessions${suffix}`)
  if (!response.ok) throw new Error(await readError(response))
  return (await response.json() as { sessions: PiAgentSessionSummaryDto[] }).sessions
}

export async function createPiAgentSession(id: string, title = '新对话') {
  const response = await fetch('/api/pi-agent/sessions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id, title }),
  })
  if (!response.ok) throw new Error(await readError(response))
  return (await response.json() as { session: PiAgentSessionDetailDto }).session
}

export async function getPiAgentSession(id: string) {
  const response = await fetch(`/api/pi-agent/sessions/${encodeURIComponent(id)}`)
  if (!response.ok) throw new Error(await readError(response))
  return (await response.json() as { session: PiAgentSessionDetailDto }).session
}

export async function renamePiAgentSession(id: string, title: string) {
  const response = await fetch(`/api/pi-agent/sessions/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title }),
  })
  if (!response.ok) throw new Error(await readError(response))
  return (await response.json() as { session: PiAgentSessionDetailDto }).session
}

export async function deletePiAgentSession(id: string) {
  const response = await fetch(
    `/api/pi-agent/sessions/${encodeURIComponent(id)}`,
    { method: 'DELETE' },
  )
  if (!response.ok) throw new Error(await readError(response))
}

export async function streamPiAgentPrompt(
  sessionId: string,
  input: {
    message: string
    modelId?: string
    contexts: Array<{ kind: string; title: string }>
    attachments?: AgentAttachment[]
  },
  signal: AbortSignal,
  onEvent: (event: PiAgentEvent) => void,
) {
  const response = await fetch(
    `/api/pi-agent/sessions/${encodeURIComponent(sessionId)}/prompt`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...input,
        attachments: await Promise.all(
          (input.attachments ?? []).map(serializeAttachment),
        ),
      }),
      signal,
    },
  )
  if (!response.ok) throw new Error(await readError(response))
  if (!response.body) throw new Error('Agent stream is unavailable')

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const frames = buffer.split('\n\n')
    buffer = frames.pop() ?? ''
    for (const frame of frames) {
      const data = frame
        .split('\n')
        .filter((line) => line.startsWith('data:'))
        .map((line) => line.slice(5).trimStart())
        .join('\n')
      if (data) {
        const event = JSON.parse(data) as PiAgentEvent
        onEvent(event)
        if (event.type === 'error') throw new Error(event.message)
      }
    }
  }
}

async function serializeAttachment(attachment: AgentAttachment) {
  if (!attachment.file) {
    throw new Error(`附件内容不可用：${attachment.name}`)
  }
  if (attachment.size > 8 * 1024 * 1024) {
    throw new Error(`附件不能超过 8MB：${attachment.name}`)
  }
  return {
    name: attachment.name,
    mimeType: attachment.mimeType,
    size: attachment.size,
    data: await fileToBase64(attachment.file),
  }
}

function fileToBase64(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(reader.error ?? new Error(`读取附件失败：${file.name}`))
    reader.onload = () => {
      const value = String(reader.result)
      resolve(value.slice(value.indexOf(',') + 1))
    }
    reader.readAsDataURL(file)
  })
}

export async function abortPiAgentPrompt(sessionId: string) {
  const response = await fetch(
    `/api/pi-agent/sessions/${encodeURIComponent(sessionId)}/abort`,
    { method: 'POST' },
  )
  if (!response.ok) throw new Error(await readError(response))
}

async function readError(response: Response) {
  try {
    const payload = await response.json() as { error?: string }
    return payload.error || `Request failed (${response.status})`
  } catch {
    return `Request failed (${response.status})`
  }
}
