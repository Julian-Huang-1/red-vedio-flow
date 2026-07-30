import { join } from 'node:path'
import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises'
import {
  AgentSession,
  defineTool,
  ModelRuntime,
  SessionManager,
  createAgentSession,
  type AgentSessionEvent,
  type SessionEntry,
  type SessionInfo,
  type ToolDefinition,
} from '@earendil-works/pi-coding-agent'

export type PiAgentModel = {
  id: string
  provider: string
  modelId: string
  label: string
}

export type PiAgentSessionSummary = {
  id: string
  title: string
  createdAt: number
  updatedAt: number
  messageCount: number
}

export type PiAgentContentBlock =
  | { type: 'text'; text: string }
  | { type: 'thinking'; thinking: string; redacted?: boolean }
  | { type: 'image'; data: string; mimeType: string }
  | { type: 'toolCall'; id: string; name: string; arguments: unknown }

export type PiAgentMessage = {
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
  content: PiAgentContentBlock[]
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
  attachments?: PiAgentAttachmentMetadata[]
}

export type PiAgentSessionDetail = PiAgentSessionSummary & {
  messages: PiAgentMessage[]
  modelId?: string
}

export type PiAgentStreamEvent =
  | { type: 'run-start'; runId: string }
  | { type: 'text-delta'; delta: string }
  | { type: 'thinking-delta'; delta: string }
  | { type: 'tool-start'; toolCallId: string; toolName: string; args: unknown }
  | { type: 'tool-update'; toolCallId: string; toolName: string; result: unknown }
  | { type: 'tool-end'; toolCallId: string; toolName: string; result: unknown; isError: boolean }
  | { type: 'run-end'; status: 'completed' | 'stopped' }
  | {
      type: 'artifact'
      artifact: {
        kind: 'html'
        title?: string
        html: string
      }
    }
  | { type: 'error'; message: string }

type ActiveSession = {
  session: AgentSession
  modelId?: string
  agentId?: string
}

export type PiAgentAttachmentInput = {
  name: string
  mimeType: string
  size: number
  data: string
}

export type PiAgentAttachmentMetadata = Omit<PiAgentAttachmentInput, 'data'>

type SessionMetadata = {
  id: string
  title: string
  createdAt: number
  updatedAt: number
}

const MAAS_PROVIDER_ID = 'rednote-maas'
const MAAS_BASE_URL = 'https://maas.devops.rednote.life/hackson/v1'
const MAAS_MODELS = [
  { id: 'GPT-5.6 Sol', name: 'GPT-5.6 Sol' },
  { id: 'Claude Sonnet 5', name: 'Claude Sonnet 5' },
  { id: 'claude opus 4.8', name: 'claude opus 4.8' },
] as const

export class PiAgentService {
  private readonly sessions = new Map<string, ActiveSession>()
  private modelRuntimePromise?: Promise<ModelRuntime>
  private sessionMetadataPromise?: Promise<Map<string, SessionMetadata>>

  constructor(
    private readonly cwd: string,
    private readonly dataDir: string,
    private readonly maasApiKey: string,
  ) {}

  async listModels(): Promise<PiAgentModel[]> {
    const runtime = await this.getModelRuntime()
    const models = await runtime.getAvailable(MAAS_PROVIDER_ID)
    return models.map((model) => ({
      id: `${model.provider}:${model.id}`,
      provider: model.provider,
      modelId: model.id,
      label: model.name || model.id,
    }))
  }

  async listSessions(query?: string): Promise<PiAgentSessionSummary[]> {
    const [sessions, metadata] = await Promise.all([
      SessionManager.list(this.cwd, this.sessionDir),
      this.getSessionMetadata(),
    ])
    const persistedById = new Map(sessions.map((session) => [session.id, session]))
    const needle = query?.trim().toLocaleLowerCase()
    return [...metadata.values()]
      .map((item) => {
        const persisted = persistedById.get(item.id)
        return persisted
          ? { ...projectSessionSummary(persisted), title: item.title }
          : { ...item, messageCount: 0 }
      })
      .filter((session) => !needle || session.title.toLocaleLowerCase().includes(needle))
      .sort((a, b) => b.updatedAt - a.updatedAt)
  }

  async createSession(input: { id?: string; title?: string } = {}) {
    const manager = SessionManager.create(
      this.cwd,
      this.sessionDir,
      input.id ? { id: input.id } : undefined,
    )
    const now = Date.now()
    const metadata: SessionMetadata = {
      id: manager.getSessionId(),
      title: input.title?.trim() || '新对话',
      createdAt: now,
      updatedAt: now,
    }
    manager.appendSessionInfo(metadata.title)
    await this.updateSessionMetadata(metadata)
    return { ...metadata, messageCount: 0, messages: [] }
  }

  async getSession(sessionId: string): Promise<PiAgentSessionDetail> {
    const [info, metadata] = await Promise.all([
      this.findSessionInfo(sessionId),
      this.getSessionMetadata().then((items) => items.get(sessionId)),
    ])
    if (!info && !metadata) throw new PiAgentSessionNotFoundError(sessionId)
    if (!info) return { ...metadata!, messageCount: 0, messages: [] }
    const active = this.sessions.get(sessionId)
    const manager = active?.session.sessionManager
      ?? SessionManager.open(info.path, this.sessionDir, this.cwd)
    return {
      ...projectSessionSummary(info),
      title: metadata?.title || manager.getSessionName() || sessionTitle(info),
      messages: projectSessionBranch(manager.getBranch()),
      modelId: active?.modelId ?? projectModelId(manager),
    }
  }

  async renameSession(sessionId: string, title: string) {
    const current = await this.getSession(sessionId)
    const info = await this.findSessionInfo(sessionId)
    if (info) {
      const manager = this.sessions.get(sessionId)?.session.sessionManager
        ?? SessionManager.open(info.path, this.sessionDir, this.cwd)
      manager.appendSessionInfo(title)
    }
    await this.updateSessionMetadata({
      id: sessionId,
      title,
      createdAt: current.createdAt,
      updatedAt: Date.now(),
    })
    return this.getSession(sessionId)
  }

  async deleteSession(sessionId: string) {
    await this.getSession(sessionId)
    const info = await this.findSessionInfo(sessionId)
    const active = this.sessions.get(sessionId)
    if (active) {
      if (active.session.isStreaming) await active.session.abort()
      active.session.dispose()
      this.sessions.delete(sessionId)
    }
    if (info) await unlink(info.path)
    await this.removeSessionMetadata(sessionId)
  }

  async prompt(
    sessionId: string,
    input: {
      message: string
      modelId?: string
      agentId?: string
      contexts?: Array<{ kind?: string; title?: string }>
      attachments?: PiAgentAttachmentInput[]
      workspace?: {
        type: 'app-builder'
        currentArtifact?: {
          id: string
          version: number
          html: string
        }
      }
    },
    emit: (event: PiAgentStreamEvent) => void,
  ) {
    const active = await this.getOrCreateSession(sessionId, input.modelId, input.agentId)
    if (active.session.isStreaming) throw new Error('session is already running')
    if (input.modelId && input.modelId !== active.modelId) {
      await this.applyModel(active, input.modelId)
    }

    const runId = crypto.randomUUID()
    emit({ type: 'run-start', runId })
    const unsubscribe = active.session.subscribe((event) => this.projectEvent(event, emit))
    try {
      const { images, textAttachments } = prepareAttachments(input.attachments)
      const prompt = formatPrompt(
        input.message,
        input.contexts,
        textAttachments,
        input.workspace,
      )
      if (!active.session.sessionName || active.session.sessionName === '新对话') {
        const title = input.message.slice(0, 24)
        active.session.sessionManager.appendSessionInfo(title)
        const metadata = await this.getSessionMetadata()
        const current = metadata.get(sessionId)
        await this.updateSessionMetadata({
          id: sessionId,
          title,
          createdAt: current?.createdAt ?? Date.now(),
          updatedAt: Date.now(),
        })
      }
      if (input.attachments?.length) {
        active.session.sessionManager.appendCustomEntry(
          'red-video-flow.attachments',
          input.attachments.map(({ data: _data, ...attachment }) => attachment),
        )
      }
      await active.session.prompt(prompt, { images })
      emit({ type: 'run-end', status: 'completed' })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      if (/abort/i.test(message)) {
        emit({ type: 'run-end', status: 'stopped' })
      } else {
        emit({ type: 'error', message })
      }
    } finally {
      unsubscribe()
    }
  }

  async abort(sessionId: string) {
    const active = this.sessions.get(sessionId)
    if (active?.session.isStreaming) await active.session.abort()
  }

  async close() {
    await Promise.all(
      [...this.sessions.values()].map(async ({ session }) => {
        if (session.isStreaming) await session.abort()
        session.dispose()
      }),
    )
    this.sessions.clear()
  }

  private getModelRuntime() {
    this.modelRuntimePromise ??= this.createModelRuntime()
    return this.modelRuntimePromise
  }

  private get sessionDir() {
    return join(this.dataDir, 'pi-agent-sessions')
  }

  private get sessionMetadataFile() {
    return join(this.sessionDir, 'sessions.json')
  }

  private getSessionMetadata() {
    this.sessionMetadataPromise ??= this.loadSessionMetadata()
    return this.sessionMetadataPromise
  }

  private async loadSessionMetadata() {
    await mkdir(this.sessionDir, { recursive: true })
    try {
      const items = JSON.parse(await readFile(this.sessionMetadataFile, 'utf8')) as SessionMetadata[]
      return new Map(items.map((item) => [item.id, item]))
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
      const sessions = await SessionManager.list(this.cwd, this.sessionDir)
      return new Map(sessions.map((session) => {
        const summary = projectSessionSummary(session)
        return [summary.id, {
          id: summary.id,
          title: summary.title,
          createdAt: summary.createdAt,
          updatedAt: summary.updatedAt,
        }]
      }))
    }
  }

  private async updateSessionMetadata(item: SessionMetadata) {
    const metadata = await this.getSessionMetadata()
    metadata.set(item.id, item)
    await this.saveSessionMetadata(metadata)
  }

  private async removeSessionMetadata(sessionId: string) {
    const metadata = await this.getSessionMetadata()
    metadata.delete(sessionId)
    await this.saveSessionMetadata(metadata)
  }

  private async saveSessionMetadata(metadata: Map<string, SessionMetadata>) {
    await writeFile(
      this.sessionMetadataFile,
      `${JSON.stringify([...metadata.values()], null, 2)}\n`,
      'utf8',
    )
  }

  private async createModelRuntime() {
    const runtime = await ModelRuntime.create()
    runtime.registerProvider(MAAS_PROVIDER_ID, {
      name: 'RedNote MaaS',
      baseUrl: MAAS_BASE_URL,
      apiKey: this.maasApiKey,
      authHeader: true,
      api: 'openai-responses',
      models: MAAS_MODELS.map((model) => ({
        ...model,
        reasoning: true,
        input: ['text', 'image'] as const,
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
        contextWindow: 128_000,
        maxTokens: 16_384,
      })),
    })
    return runtime
  }

  private async getOrCreateSession(sessionId: string, modelId?: string, agentId?: string) {
    const existing = this.sessions.get(sessionId)
    if (existing && existing.agentId === agentId) return existing
    if (existing) {
      existing.session.dispose()
      this.sessions.delete(sessionId)
    }

    const modelRuntime = await this.getModelRuntime()
    const info = await this.findSessionInfo(sessionId)
    const sessionManager = info
      ? SessionManager.open(info.path, this.sessionDir, this.cwd)
      : SessionManager.create(this.cwd, this.sessionDir, { id: sessionId })
    const model = modelId ? resolveModel(modelRuntime, modelId) : undefined
    debugger
    const appBuilder = agentId === 'app-builder-agent'
    const publishHtmlTool = createPublishHtmlTool()
    const { session } = await createAgentSession({
      cwd: this.cwd,
      modelRuntime,
      model,
      sessionManager,
      tools: appBuilder
        ? ['publish_html']
        : [],
        // : ['read', 'grep', 'find', 'ls'],
      customTools: appBuilder ? [publishHtmlTool] : undefined,
    })
    const active = {
      session,
      modelId: model ? `${model.provider}:${model.id}` : undefined,
      agentId,
    }
    this.sessions.set(sessionId, active)
    return active
  }

  private async findSessionInfo(sessionId: string) {
    const sessions = await SessionManager.list(this.cwd, this.sessionDir)
    return sessions.find((session) => session.id === sessionId)
  }

  private async applyModel(active: ActiveSession, id: string) {
    const runtime = await this.getModelRuntime()
    const model = resolveModel(runtime, id)
    if (!model) throw new Error(`model not found: ${id}`)
    await active.session.setModel(model)
    active.modelId = id
  }

  private projectEvent(
    event: AgentSessionEvent,
    emit: (event: PiAgentStreamEvent) => void,
  ) {
    if (
      event.type === 'message_update'
      && event.assistantMessageEvent.type === 'text_delta'
    ) {
      emit({ type: 'text-delta', delta: event.assistantMessageEvent.delta })
    } else if (
      event.type === 'message_update'
      && event.assistantMessageEvent.type === 'thinking_delta'
    ) {
      emit({ type: 'thinking-delta', delta: event.assistantMessageEvent.delta })
    } else if (event.type === 'tool_execution_start') {
      emit({
        type: 'tool-start',
        toolCallId: event.toolCallId,
        toolName: event.toolName,
        args: event.args,
      })
    } else if (event.type === 'tool_execution_update') {
      emit({
        type: 'tool-update',
        toolCallId: event.toolCallId,
        toolName: event.toolName,
        result: event.partialResult,
      })
    } else if (event.type === 'tool_execution_end') {
      const artifact = projectHtmlArtifact(event.toolName, event.result)
      if (artifact && !event.isError) emit({ type: 'artifact', artifact })
      emit({
        type: 'tool-end',
        toolCallId: event.toolCallId,
        toolName: event.toolName,
        result: event.result,
        isError: event.isError,
      })
    }
  }
}

export class PiAgentSessionNotFoundError extends Error {
  constructor(readonly sessionId: string) {
    super(`Pi Agent session not found: ${sessionId}`)
    this.name = 'PiAgentSessionNotFoundError'
  }
}

function sessionTitle(session: SessionInfo) {
  return session.name || session.firstMessage.slice(0, 24) || '新对话'
}

function projectSessionSummary(session: SessionInfo): PiAgentSessionSummary {
  return {
    id: session.id,
    title: sessionTitle(session),
    createdAt: session.created.getTime(),
    updatedAt: session.modified.getTime(),
    messageCount: session.messageCount,
  }
}

export function projectSessionEntry(entry: SessionEntry): PiAgentMessage[] {
  if (entry.type === 'compaction') {
    return [{
      id: entry.id,
      role: 'compactionSummary',
      text: entry.summary,
      content: [{ type: 'text', text: entry.summary }],
      createdAt: Date.parse(entry.timestamp),
      status: 'completed',
      tokensBefore: entry.tokensBefore,
    }]
  }
  if (entry.type === 'branch_summary') {
    return [{
      id: entry.id,
      role: 'branchSummary',
      text: entry.summary,
      content: [{ type: 'text', text: entry.summary }],
      createdAt: Date.parse(entry.timestamp),
      status: 'completed',
      fromId: entry.fromId,
    }]
  }
  if (entry.type === 'custom_message') {
    if (!entry.display) return []
    const content = projectContent(entry.content)
    return [{
      id: entry.id,
      role: 'custom',
      text: textFromContent(content),
      content,
      createdAt: Date.parse(entry.timestamp),
      status: 'completed',
      customType: entry.customType,
      display: entry.display,
      details: entry.details,
    }]
  }
  if (entry.type !== 'message') return []

  const message = entry.message
  if (message.role === 'user') {
    const content = projectContent(message.content)
    return [baseMessage(entry.id, 'user', content, message.timestamp)]
  }
  if (message.role === 'assistant') {
    const content = projectContent(message.content)
    return [{
      ...baseMessage(entry.id, 'assistant', content, message.timestamp),
      status: message.stopReason === 'aborted'
        ? 'stopped'
        : message.stopReason === 'error'
          ? 'error'
          : 'completed',
      errorMessage: message.errorMessage,
    }]
  }
  if (message.role === 'toolResult') {
    const content = projectContent(message.content)
    return [{
      ...baseMessage(entry.id, 'toolResult', content, message.timestamp),
      status: message.isError ? 'error' : 'completed',
      toolCallId: message.toolCallId,
      toolName: message.toolName,
      isError: message.isError,
      details: message.details,
    }]
  }
  if (message.role === 'bashExecution') {
    const content = [{ type: 'text' as const, text: message.output }]
    return [{
      ...baseMessage(entry.id, 'bashExecution', content, message.timestamp),
      status: message.cancelled ? 'stopped' : message.exitCode ? 'error' : 'completed',
      command: message.command,
      exitCode: message.exitCode,
      cancelled: message.cancelled,
      truncated: message.truncated,
    }]
  }
  if (message.role === 'custom') {
    if (!message.display) return []
    const content = projectContent(message.content)
    return [{
      ...baseMessage(entry.id, 'custom', content, message.timestamp),
      customType: message.customType,
      display: message.display,
      details: message.details,
    }]
  }
  if (message.role === 'branchSummary') {
    const content = [{ type: 'text' as const, text: message.summary }]
    return [{
      ...baseMessage(entry.id, 'branchSummary', content, message.timestamp),
      fromId: message.fromId,
    }]
  }
  if (message.role === 'compactionSummary') {
    const content = [{ type: 'text' as const, text: message.summary }]
    return [{
      ...baseMessage(entry.id, 'compactionSummary', content, message.timestamp),
      tokensBefore: message.tokensBefore,
    }]
  }
  return []
}

export function projectSessionBranch(entries: SessionEntry[]): PiAgentMessage[] {
  const messages: PiAgentMessage[] = []
  let pendingAttachments: PiAgentAttachmentMetadata[] | undefined

  for (const entry of entries) {
    if (
      entry.type === 'custom'
      && entry.customType === 'red-video-flow.attachments'
    ) {
      pendingAttachments = parseAttachmentMetadata(entry.data)
      continue
    }

    const projected = projectSessionEntry(entry)
    for (const message of projected) {
      if (message.role === 'user' && pendingAttachments?.length) {
        message.attachments = pendingAttachments
        pendingAttachments = undefined
      }
      messages.push(message)
    }
  }

  return messages
}

function parseAttachmentMetadata(value: unknown): PiAgentAttachmentMetadata[] | undefined {
  if (!Array.isArray(value)) return undefined
  const attachments = value.flatMap((item) => {
    if (!item || typeof item !== 'object') return []
    const candidate = item as Record<string, unknown>
    if (
      typeof candidate.name !== 'string'
      || typeof candidate.mimeType !== 'string'
      || typeof candidate.size !== 'number'
    ) return []
    return [{
      name: candidate.name,
      mimeType: candidate.mimeType,
      size: candidate.size,
    }]
  })
  return attachments.length ? attachments : undefined
}

function baseMessage(
  id: string,
  role: PiAgentMessage['role'],
  content: PiAgentContentBlock[],
  createdAt: number,
): PiAgentMessage {
  return {
    id,
    role,
    text: textFromContent(content),
    content,
    createdAt,
    status: 'completed',
  }
}

function projectContent(content: unknown): PiAgentContentBlock[] {
  if (typeof content === 'string') return [{ type: 'text', text: content }]
  if (!Array.isArray(content)) return []
  return content.flatMap((item): PiAgentContentBlock[] => {
    if (!item || typeof item !== 'object') return []
    const block = item as Record<string, unknown>
    if (block.type === 'text' && typeof block.text === 'string') {
      return [{ type: 'text', text: block.text }]
    }
    if (block.type === 'thinking' && typeof block.thinking === 'string') {
      return [{
        type: 'thinking',
        thinking: block.thinking,
        redacted: block.redacted === true || undefined,
      }]
    }
    if (
      block.type === 'image'
      && typeof block.data === 'string'
      && typeof block.mimeType === 'string'
    ) {
      return [{ type: 'image', data: block.data, mimeType: block.mimeType }]
    }
    if (
      block.type === 'toolCall'
      && typeof block.id === 'string'
      && typeof block.name === 'string'
    ) {
      return [{
        type: 'toolCall',
        id: block.id,
        name: block.name,
        arguments: block.arguments,
      }]
    }
    return []
  })
}

function textFromContent(content: PiAgentContentBlock[]) {
  return content
    .filter((block): block is Extract<PiAgentContentBlock, { type: 'text' }> =>
      block.type === 'text')
    .map((block) => block.text)
    .join('')
}

function projectModelId(manager: SessionManager) {
  const model = manager.buildSessionContext().model
  return model ? `${model.provider}:${model.modelId}` : undefined
}

function resolveModel(runtime: ModelRuntime, id: string) {
  const separator = id.indexOf(':')
  if (separator < 1) return undefined
  return runtime.getModel(id.slice(0, separator), id.slice(separator + 1))
}

export function formatPrompt(
  message: string,
  contexts: Array<{ kind?: string; title?: string }> | undefined,
  textAttachments: Array<{ name: string; text: string }> = [],
  workspace?: {
    type: 'app-builder'
    currentArtifact?: {
      id: string
      version: number
      html: string
    }
  },
) {
  const validContexts = contexts?.filter((item) => item.title?.trim()) ?? []
  const sections = [message]
  if (workspace?.type === 'app-builder') {
    sections.push(APP_BUILDER_INSTRUCTIONS)
    if (workspace.currentArtifact) {
      sections.push(
        `Current HTML artifact (id: ${workspace.currentArtifact.id}, version: ${workspace.currentArtifact.version}):\n\n${workspace.currentArtifact.html}`,
      )
    }
  }
  if (validContexts.length) {
    sections.push(
      `Attached workflow context:\n${validContexts
        .map((item) => `- [${item.kind || 'context'}] ${item.title!.trim()}`)
        .join('\n')}`,
    )
  }
  for (const attachment of textAttachments) {
    sections.push(`Attached file: ${attachment.name}\n\n${attachment.text}`)
  }
  return sections.join('\n\n')
}

const MAX_HTML_ARTIFACT_BYTES = 300 * 1024

const APP_BUILDER_INSTRUCTIONS = `You are operating in App Builder mode.
- Build a single complete HTML document with inline CSS and JavaScript.
- Make the result responsive and usable on desktop and mobile.
- When modifying an existing artifact, preserve working features unless the user asks to remove them.
- When the page is ready, call publish_html exactly once with the complete document.
- Do not paste the complete HTML into the conversational response.
- If requirements are unclear, ask a concise clarification question and do not call publish_html.
- Do not attempt to access the parent window, cookies, local storage, camera, microphone, popups, downloads, or top-level navigation.`

function createPublishHtmlTool() {
  const tool: ToolDefinition = {
    name: 'publish_html',
    label: 'Publish HTML',
    description: 'Publishes the complete single-file HTML document for App Builder preview.',
    promptSnippet: 'Publish a complete App Builder HTML document.',
    promptGuidelines: [
      'Call publish_html once after the requested page is complete.',
      'Always submit a complete HTML document with inline CSS and JavaScript.',
    ],
    parameters: {
      type: 'object',
      required: ['html'],
      properties: {
        title: {
          type: 'string',
          description: 'Short title for the generated app',
        },
        html: {
          type: 'string',
          description: 'Complete single-file HTML document',
        },
      },
    } as ToolDefinition['parameters'],
    execute: async (_toolCallId, rawParams) => {
      const params = rawParams as { title?: string; html: string }
      const html = params.html.trim()
      if (!html) throw new Error('HTML artifact cannot be empty')
      if (Buffer.byteLength(html, 'utf8') > MAX_HTML_ARTIFACT_BYTES) {
        throw new Error('HTML artifact exceeds the 300KB limit')
      }
      return {
        content: [{ type: 'text' as const, text: 'HTML artifact is ready for preview.' }],
        details: {
          artifact: {
            kind: 'html' as const,
            title: params.title?.trim() || undefined,
            html,
          },
        },
      }
    },
  }
  return defineTool(tool)
}

export function projectHtmlArtifact(toolName: string, result: unknown) {
  if (toolName !== 'publish_html' || !result || typeof result !== 'object') return undefined
  const details = (result as { details?: unknown }).details
  if (!details || typeof details !== 'object') return undefined
  const artifact = (details as { artifact?: unknown }).artifact
  if (!artifact || typeof artifact !== 'object') return undefined
  const candidate = artifact as Record<string, unknown>
  if (candidate.kind !== 'html' || typeof candidate.html !== 'string') return undefined
  return {
    kind: 'html' as const,
    title: typeof candidate.title === 'string' ? candidate.title : undefined,
    html: candidate.html,
  }
}

export function prepareAttachments(attachments: PiAgentAttachmentInput[] | undefined) {
  const images: Array<{ type: 'image'; data: string; mimeType: string }> = []
  const textAttachments: Array<{ name: string; text: string }> = []
  let totalSize = 0

  for (const attachment of attachments ?? []) {
    totalSize += attachment.size
    if (attachment.size > 8 * 1024 * 1024 || totalSize > 16 * 1024 * 1024) {
      throw new Error('附件大小超过限制：单个 8MB，总计 16MB')
    }
    if (!/^[A-Za-z0-9+/]*={0,2}$/.test(attachment.data)) {
      throw new Error(`附件编码无效：${attachment.name}`)
    }
    if (attachment.mimeType.startsWith('image/')) {
      images.push({
        type: 'image',
        data: attachment.data,
        mimeType: attachment.mimeType,
      })
      continue
    }
    if (
      attachment.mimeType.startsWith('text/')
      || attachment.mimeType === 'application/json'
      || attachment.mimeType === 'application/xml'
    ) {
      textAttachments.push({
        name: attachment.name,
        text: Buffer.from(attachment.data, 'base64').toString('utf8'),
      })
      continue
    }
    throw new Error(`暂不支持该附件类型：${attachment.name} (${attachment.mimeType})`)
  }

  return { images, textAttachments }
}
