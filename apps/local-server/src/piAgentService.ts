import { join } from 'node:path'
import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises'
import {
  AgentSession,
  ModelRuntime,
  SessionManager,
  createAgentSession,
  type AgentSessionEvent,
  type SessionInfo,
  type SessionMessageEntry,
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

export type PiAgentMessage = {
  id: string
  role: 'user' | 'assistant'
  text: string
  createdAt: number
  status: 'completed' | 'stopped' | 'error'
}

export type PiAgentSessionDetail = PiAgentSessionSummary & {
  messages: PiAgentMessage[]
  modelId?: string
}

export type PiAgentStreamEvent =
  | { type: 'run-start'; runId: string }
  | { type: 'text-delta'; delta: string }
  | { type: 'tool-start'; toolCallId: string; toolName: string; args: unknown }
  | { type: 'tool-update'; toolCallId: string; toolName: string; result: unknown }
  | { type: 'tool-end'; toolCallId: string; toolName: string; result: unknown; isError: boolean }
  | { type: 'run-end'; status: 'completed' | 'stopped' }
  | { type: 'error'; message: string }

type ActiveSession = {
  session: AgentSession
  modelId?: string
}

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
      messages: manager.getBranch().flatMap(projectSessionEntry),
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
      contexts?: Array<{ kind?: string; title?: string }>
    },
    emit: (event: PiAgentStreamEvent) => void,
  ) {
    const active = await this.getOrCreateSession(sessionId, input.modelId)
    if (active.session.isStreaming) throw new Error('session is already running')
    if (input.modelId && input.modelId !== active.modelId) {
      await this.applyModel(active, input.modelId)
    }

    const runId = crypto.randomUUID()
    emit({ type: 'run-start', runId })
    const unsubscribe = active.session.subscribe((event) => this.projectEvent(event, emit))
    try {
      const prompt = formatPrompt(input.message, input.contexts)
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
      await active.session.prompt(prompt)
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
        input: ['text'] as const,
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
        contextWindow: 128_000,
        maxTokens: 16_384,
      })),
    })
    return runtime
  }

  private async getOrCreateSession(sessionId: string, modelId?: string) {
    const existing = this.sessions.get(sessionId)
    if (existing) return existing

    const modelRuntime = await this.getModelRuntime()
    const info = await this.findSessionInfo(sessionId)
    const sessionManager = info
      ? SessionManager.open(info.path, this.sessionDir, this.cwd)
      : SessionManager.create(this.cwd, this.sessionDir, { id: sessionId })
    const model = modelId ? resolveModel(modelRuntime, modelId) : undefined
    const { session } = await createAgentSession({
      cwd: this.cwd,
      modelRuntime,
      model,
      sessionManager,
      tools: ['read', 'grep', 'find', 'ls'],
    })
    const active = { session, modelId: model ? `${model.provider}:${model.id}` : undefined }
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

function projectSessionEntry(entry: unknown): PiAgentMessage[] {
  if (!isSessionMessageEntry(entry)) return []
  const { message } = entry
  if (message.role !== 'user' && message.role !== 'assistant') return []
  const text = typeof message.content === 'string'
    ? message.content
    : message.content
      .filter((item) => item.type === 'text')
      .map((item) => item.text)
      .join('')
  return [{
    id: entry.id,
    role: message.role,
    text,
    createdAt: message.timestamp,
    status: message.role === 'assistant'
      ? message.stopReason === 'aborted'
        ? 'stopped'
        : message.stopReason === 'error'
          ? 'error'
          : 'completed'
      : 'completed',
  }]
}

function isSessionMessageEntry(entry: unknown): entry is SessionMessageEntry {
  return Boolean(entry && typeof entry === 'object' && (entry as { type?: string }).type === 'message')
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

function formatPrompt(
  message: string,
  contexts: Array<{ kind?: string; title?: string }> | undefined,
) {
  const validContexts = contexts?.filter((item) => item.title?.trim()) ?? []
  if (!validContexts.length) return message
  const contextText = validContexts
    .map((item) => `- [${item.kind || 'context'}] ${item.title!.trim()}`)
    .join('\n')
  return `${message}\n\nAttached workflow context:\n${contextText}`
}
