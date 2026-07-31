import { create } from 'zustand'
import type {
  AgentAttachment,
  AgentContextItem,
  AgentMessage,
  AgentModelOption,
  AgentOption,
  AgentResourceReference,
  AgentRunStatus,
  AgentSession,
} from './agentBoxTypes'
import {
  abortPiAgentPrompt,
  streamPiAgentPrompt,
  type PiAgentEvent,
  type PiAgentSessionDetailDto,
  type PiAgentSessionSummaryDto,
} from './piAgentClient'
import { useAppBuilderStore } from '../../pages/app-builder/appBuilderStore'
import { resolveAgentResourceUrl } from './resourceUrl'

const agents: AgentOption[] = [
  { id: 'workflow-agent', label: '工作流助手', description: '规划和修改视频工作流' },
  { id: 'script-agent', label: '脚本助手', description: '编写脚本与分镜' },
  { id: 'app-builder-agent', label: 'App Builder', description: '生成和迭代单文件 HTML 应用' },
]

const models: AgentModelOption[] = [
  { id: 'claude-sonnet', label: 'Claude Sonnet' },
  { id: 'gpt-5', label: 'GPT-5' },
  { id: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro' },
]

const initialTimestamp = Date.now()
const initialSessionId = 'session-welcome'
const initialUserMessageId = 'message-welcome-user'
const initialAssistantMessageId = 'message-welcome-assistant'

const initialSessions: Record<string, AgentSession> = {
  [initialSessionId]: {
    id: initialSessionId,
    title: '短视频工作流规划',
    createdAt: initialTimestamp,
    updatedAt: initialTimestamp,
    messageIds: [initialUserMessageId, initialAssistantMessageId],
  },
}


const initialContexts: Record<string, AgentContextItem> = {
  'node-storyboard': { id: 'node-storyboard', kind: 'node', title: '分镜脚本' },
  'asset-character': { id: 'asset-character', kind: 'asset', title: '主角参考图' },
}

let activeRunController: AbortController | undefined

const createId = (prefix: string) =>
  `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

function appendResourcesToPrompt(prompt: string, resources: AgentResourceReference[]) {
  if (!resources.length) return prompt
  const resourcesWithAbsoluteUrls = resources.map((resource) => ({
    ...resource,
    url: resolveAgentResourceUrl(resource.url),
    thumbnailUrl: resolveAgentResourceUrl(resource.thumbnailUrl),
  }))
  return `${prompt}\n\n用户选择的资源对象：\n${JSON.stringify(resourcesWithAbsoluteUrls, null, 2)}`
}

type AgentBoxState = {
  open: boolean
  sessionIds: string[]
  sessionsById: Record<string, AgentSession>
  activeSessionId?: string
  historyOpen: boolean
  historyQuery: string
  agents: AgentOption[]
  models: AgentModelOption[]
  selectedAgentId: string
  selectedModelId: string
  draft: string
  pendingAttachments: AgentAttachment[]
  pendingResources: AgentResourceReference[]
  attachmentsById: Record<string, AgentAttachment>
  resourcesById: Record<string, AgentResourceReference>
  mentionedNodeIds: string[]
  contextIds: string[]
  contextsById: Record<string, AgentContextItem>
  contextExpanded: boolean
  messagesById: Record<string, AgentMessage>
  activeAssistantMessageId?: string
  runStatus: AgentRunStatus
  activeRunId?: string
  runError?: string
  autoScroll: boolean
  unreadCount: number
}

type PromptRunner = typeof streamPiAgentPrompt
type AbortRunner = typeof abortPiAgentPrompt

type AgentBoxActions = {
  hydrateModels: (models: AgentModelOption[]) => void
  hydrateSessions: (sessions: PiAgentSessionSummaryDto[]) => void
  hydrateSession: (session: PiAgentSessionDetailDto) => void
  setRunError: (message?: string) => void
  openDrawer: () => void
  closeDrawer: () => void
  createSession: (id?: string) => string
  selectSession: (id: string) => void
  renameSession: (id: string, title: string) => void
  deleteSession: (id: string) => void
  toggleHistory: () => void
  setHistoryQuery: (value: string) => void
  selectAgent: (id: string) => void
  selectModel: (id: string) => void
  setDraft: (value: string) => void
  addAttachment: (file: File) => void
  removeAttachment: (id: string) => void
  addResource: (resource: AgentResourceReference) => void
  removeResource: (id: string) => void
  mentionNode: (id: string, title: string) => void
  addContext: (item: AgentContextItem) => void
  removeContext: (id: string) => void
  clearContext: () => void
  setContextExpanded: (expanded: boolean) => void
  submit: (runner?: PromptRunner) => Promise<void>
  stop: (aborter?: AbortRunner) => void
  retry: (messageId: string, runner?: PromptRunner) => Promise<void>
  setAutoScroll: (enabled: boolean) => void
  markMessagesRead: () => void
  resetConversation: () => void
  reset: () => void
}

export type AgentBoxStore = AgentBoxState & AgentBoxActions

const initialState: AgentBoxState = {
  open: true,
  sessionIds: [initialSessionId],
  sessionsById: initialSessions,
  activeSessionId: initialSessionId,
  historyOpen: false,
  historyQuery: '',
  agents,
  models,
  selectedAgentId: agents[0].id,
  selectedModelId: models[0].id,
  draft: '',
  pendingAttachments: [],
  pendingResources: [],
  attachmentsById: {},
  resourcesById: {},
  mentionedNodeIds: [],
  contextIds: Object.keys(initialContexts),
  contextsById: initialContexts,
  contextExpanded: true,
  messagesById: {},
  activeAssistantMessageId: undefined,
  runStatus: 'idle',
  activeRunId: undefined,
  runError: undefined,
  autoScroll: true,
  unreadCount: 0,
}

export const useAgentBoxStore = create<AgentBoxStore>((set, get) => {
  const applySessionDetail = (detail: PiAgentSessionDetailDto) => {
    const hydratedAttachments = Object.fromEntries(
      detail.messages.flatMap((message) =>
        (message.attachments ?? []).map((attachment, index) => {
          const id = `${message.id}-attachment-${index}`
          return [id, { id, ...attachment }]
        }),
      ),
    )
    const messages = Object.fromEntries(detail.messages.map((message) => [
      message.id,
      {
        ...message,
        attachmentIds: (message.attachments ?? []).map(
          (_attachment, index) => `${message.id}-attachment-${index}`,
        ),
      },
    ]))
    set((state) => ({
      messagesById: { ...state.messagesById, ...messages },
      attachmentsById: { ...state.attachmentsById, ...hydratedAttachments },
      sessionsById: {
        ...state.sessionsById,
        [detail.id]: {
          id: detail.id,
          title: detail.title,
          createdAt: detail.createdAt,
          updatedAt: detail.updatedAt,
          messageIds: detail.messages.map((message) => message.id),
        },
      },
      selectedModelId: detail.modelId || state.selectedModelId,
    }))
  }

  const updateSessionMessages = (sessionId: string, messageIds: string[]) => {
    const session = get().sessionsById[sessionId]
    if (!session) return
    set((state) => ({
      sessionsById: {
        ...state.sessionsById,
        [sessionId]: {
          ...session,
          messageIds,
          updatedAt: Date.now(),
        },
      },
    }))
  }

  const runAssistant = async (
    sessionId: string,
    prompt: string,
    runner: PromptRunner = streamPiAgentPrompt,
    attachments: AgentAttachment[] = [],
    resources: AgentResourceReference[] = [],
  ) => {
    const assistantMessageId = createId('message-assistant')
    const runId = createId('run')
    const controller = new AbortController()
    const appBuilder = get().selectedAgentId === 'app-builder-agent'
    let appBuilderTerminalHandled = false
    activeRunController?.abort()
    activeRunController = controller
    if (appBuilder) {
      useAppBuilderStore.getState().beginGeneration(sessionId)
    }

    set((state) => ({
      activeAssistantMessageId: assistantMessageId,
      activeRunId: runId,
      runStatus: 'submitting',
      runError: undefined,
      messagesById: {
        ...state.messagesById,
        [assistantMessageId]: {
          id: assistantMessageId,
          role: 'assistant',
          text: '',
          status: 'streaming',
          createdAt: Date.now(),
          attachmentIds: [],
        },
      },
    }))

    const session = get().sessionsById[sessionId]
    if (session) updateSessionMessages(sessionId, [...session.messageIds, assistantMessageId])

    try {
      const state = get()
      const currentArtifact = useAppBuilderStore.getState().artifactsBySessionId[sessionId]
      const attachmentResources = appBuilder
        ? resources.filter((resource) => resource.kind !== 'video')
        : resources
      const contexts = state.contextIds
        .map((id) => state.contextsById[id])
        .filter(Boolean)
        .map(({ kind, title }) => ({ kind, title }))
      await runner(
        sessionId,
        {
          message: appBuilder ? appendResourcesToPrompt(prompt, resources) : prompt,
          modelId: state.selectedModelId,
          agentId: state.selectedAgentId,
          contexts,
          attachments,
          resources: attachmentResources,
          workspace: appBuilder
            ? {
                type: 'app-builder',
                currentArtifact: currentArtifact
                  ? {
                      id: currentArtifact.id,
                      version: currentArtifact.version,
                      html: currentArtifact.html,
                    }
                  : undefined,
              }
            : undefined,
        },
        controller.signal,
        (event: PiAgentEvent) => {
          if (event.type === 'run-start') {
            set({ runStatus: 'streaming', activeRunId: event.runId })
            return
          }
          if (event.type === 'artifact') {
            if (appBuilder && event.artifact.kind === 'html') {
              useAppBuilderStore.getState().stageArtifact({
                sessionId,
                title: event.artifact.title,
                html: event.artifact.html,
              })
            }
            return
          }
          if (event.type === 'run-end') {
            if (appBuilder) {
              appBuilderTerminalHandled = true
              if (event.status === 'completed') {
                useAppBuilderStore.getState().completeGeneration(sessionId)
              } else {
                useAppBuilderStore.getState().cancelGeneration(sessionId)
              }
            }
            return
          }
          if (event.type === 'error') {
            if (appBuilder) {
              appBuilderTerminalHandled = true
              useAppBuilderStore.getState().failGeneration(sessionId, event.message)
            }
            return
          }
          if (
            event.type === 'tool-start'
            || event.type === 'tool-update'
            || event.type === 'tool-end'
          ) {
            const toolMessageId = `tool-${event.toolCallId}`
            set((state) => {
              const current = state.messagesById[toolMessageId]
              const activeSession = state.sessionsById[sessionId]
              const details = event.type === 'tool-start' ? event.args : event.result
              return {
                messagesById: {
                  ...state.messagesById,
                  [toolMessageId]: {
                    id: toolMessageId,
                    role: 'toolResult',
                    text: '',
                    content: [],
                    status: event.type === 'tool-end'
                      ? event.isError ? 'error' : 'completed'
                      : 'streaming',
                    createdAt: current?.createdAt ?? Date.now(),
                    attachmentIds: [],
                    toolCallId: event.toolCallId,
                    toolName: event.toolName,
                    isError: event.type === 'tool-end' ? event.isError : false,
                    details,
                  },
                },
                sessionsById: activeSession && !activeSession.messageIds.includes(toolMessageId)
                  ? {
                      ...state.sessionsById,
                      [sessionId]: {
                        ...activeSession,
                        messageIds: [...activeSession.messageIds, toolMessageId],
                      },
                    }
                  : state.sessionsById,
              }
            })
            return
          }
          if (event.type === 'thinking-delta') {
            set((state) => {
              const current = state.messagesById[assistantMessageId]
              if (!current) return state
              const content = current.content ? [...current.content] : []
              const last = content[content.length - 1]
              if (last?.type === 'thinking') {
                content[content.length - 1] = {
                  ...last,
                  thinking: last.thinking + event.delta,
                }
              } else {
                content.push({ type: 'thinking', thinking: event.delta })
              }
              return {
                messagesById: {
                  ...state.messagesById,
                  [assistantMessageId]: { ...current, content },
                },
              }
            })
            return
          }
          if (event.type !== 'text-delta') return
        set((state) => {
          const current = state.messagesById[assistantMessageId]
          if (!current) return state
          const content = current.content ? [...current.content] : []
          const last = content[content.length - 1]
          if (last?.type === 'text') {
            content[content.length - 1] = { ...last, text: last.text + event.delta }
          } else {
            content.push({ type: 'text', text: event.delta })
          }
          return {
            messagesById: {
              ...state.messagesById,
              [assistantMessageId]: {
                ...current,
                text: current.text + event.delta,
                content,
              },
            },
          }
          })
        },
      )
      if (appBuilder && !appBuilderTerminalHandled) {
        useAppBuilderStore.getState().failGeneration(
          sessionId,
          'Agent 连接已结束，但没有收到生成完成事件。',
        )
      }

      set((state) => ({
        runStatus: 'idle',
        activeRunId: undefined,
        activeAssistantMessageId: undefined,
        unreadCount: state.open ? state.unreadCount : state.unreadCount + 1,
        messagesById: {
          ...state.messagesById,
          [assistantMessageId]: {
            ...state.messagesById[assistantMessageId],
            status: 'completed',
          },
        },
      }))
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return
      if (appBuilder && !appBuilderTerminalHandled) {
        useAppBuilderStore.getState().failGeneration(
          sessionId,
          error instanceof Error ? error.message : String(error),
        )
      }
      set((state) => ({
        runStatus: 'error',
        runError: error instanceof Error ? error.message : String(error),
        activeRunId: undefined,
        activeAssistantMessageId: undefined,
        messagesById: {
          ...state.messagesById,
          [assistantMessageId]: {
            ...state.messagesById[assistantMessageId],
            status: 'error',
          },
        },
      }))
    } finally {
      if (activeRunController === controller) activeRunController = undefined
    }
  }

  return {
    ...initialState,

    hydrateModels: (availableModels) => set((state) => ({
      models: availableModels,
      selectedModelId: availableModels.some((model) => model.id === state.selectedModelId)
        ? state.selectedModelId
        : availableModels[0]?.id ?? state.selectedModelId,
    })),
    hydrateSessions: (savedSessions) => set((state) => ({
      sessionIds: savedSessions.map((session) => session.id),
      sessionsById: Object.fromEntries(savedSessions.map((session) => [
        session.id,
        {
          id: session.id,
          title: session.title,
          createdAt: session.createdAt,
          updatedAt: session.updatedAt,
          messageIds: state.sessionsById[session.id]?.messageIds ?? [],
        },
      ])),
      activeSessionId: savedSessions.some((session) => session.id === state.activeSessionId)
        ? state.activeSessionId
        : savedSessions[0]?.id,
    })),
    hydrateSession: applySessionDetail,
    setRunError: (runError) => set({ runError }),
    openDrawer: () => set({ open: true, unreadCount: 0 }),
    closeDrawer: () => set({ open: false }),

    createSession: (requestedId) => {
      const id = requestedId ?? createId('session')
      const timestamp = Date.now()
      set((state) => ({
        activeSessionId: id,
        sessionIds: [id, ...state.sessionIds],
        sessionsById: {
          ...state.sessionsById,
          [id]: {
            id,
            title: '新对话',
            createdAt: timestamp,
            updatedAt: timestamp,
            messageIds: [],
          },
        },
        historyOpen: false,
        draft: '',
        pendingAttachments: [],
        pendingResources: [],
        mentionedNodeIds: [],
        runError: undefined,
      }))
      return id
    },
    selectSession: (id) => {
      if (!get().sessionsById[id]) return
      get().stop()
      set({ activeSessionId: id, historyOpen: false, runError: undefined })
    },
    renameSession: (id, title) => {
      const session = get().sessionsById[id]
      const nextTitle = title.trim()
      if (!session || !nextTitle) return
      set((state) => ({
        sessionsById: {
          ...state.sessionsById,
          [id]: { ...session, title: nextTitle, updatedAt: Date.now() },
        },
      }))
    },
    deleteSession: (id) => {
      const state = get()
      if (!state.sessionsById[id]) return
      const nextIds = state.sessionIds.filter((sessionId) => sessionId !== id)
      const { [id]: deletedSession, ...remainingSessions } = state.sessionsById
      const remainingMessages = { ...state.messagesById }
      deletedSession.messageIds.forEach((messageId) => delete remainingMessages[messageId])
      set({
        sessionIds: nextIds,
        sessionsById: remainingSessions,
        messagesById: remainingMessages,
        activeSessionId: state.activeSessionId === id ? nextIds[0] : state.activeSessionId,
      })
      useAppBuilderStore.getState().removeArtifact(id)
      if (!nextIds.length) get().createSession()
    },
    toggleHistory: () => set((state) => ({ historyOpen: !state.historyOpen })),
    setHistoryQuery: (historyQuery) => set({ historyQuery }),

    selectAgent: (selectedAgentId) => set({ selectedAgentId }),
    selectModel: (selectedModelId) => set({ selectedModelId }),
    setDraft: (draft) => set({ draft }),
    addAttachment: (file) => {
      const attachment: AgentAttachment = {
        id: createId('attachment'),
        name: file.name,
        mimeType: file.type || 'application/octet-stream',
        size: file.size,
        file,
      }
      set((state) => ({
        pendingAttachments: [...state.pendingAttachments, attachment],
        attachmentsById: { ...state.attachmentsById, [attachment.id]: attachment },
      }))
    },
    removeAttachment: (id) => set((state) => ({
      pendingAttachments: state.pendingAttachments.filter((attachment) => attachment.id !== id),
    })),
    addResource: (resource) => set((state) => ({
      pendingResources: state.pendingResources.some((item) => item.resourceId === resource.resourceId)
        ? state.pendingResources
        : [...state.pendingResources, resource],
      resourcesById: { ...state.resourcesById, [resource.id]: resource },
    })),
    removeResource: (id) => set((state) => ({
      pendingResources: state.pendingResources.filter((resource) => resource.id !== id),
    })),
    mentionNode: (id, title) => set((state) => ({
      draft: `${state.draft}${state.draft && !state.draft.endsWith(' ') ? ' ' : ''}@${title} `,
      mentionedNodeIds: state.mentionedNodeIds.includes(id)
        ? state.mentionedNodeIds
        : [...state.mentionedNodeIds, id],
    })),

    addContext: (item) => set((state) => ({
      contextIds: state.contextIds.includes(item.id)
        ? state.contextIds
        : [...state.contextIds, item.id],
      contextsById: { ...state.contextsById, [item.id]: item },
      contextExpanded: true,
    })),
    removeContext: (id) => set((state) => ({
      contextIds: state.contextIds.filter((contextId) => contextId !== id),
    })),
    clearContext: () => set({ contextIds: [] }),
    setContextExpanded: (contextExpanded) => set({ contextExpanded }),

    submit: async (runner) => {
      const state = get()
      if (
        state.runStatus !== 'idle'
        || (!state.draft.trim() && !state.pendingAttachments.length && !state.pendingResources.length)
      ) return

      let sessionId = state.activeSessionId
      if (!sessionId) {
        get().createSession()
        sessionId = get().activeSessionId
      }
      if (!sessionId) return

      const userMessageId = createId('message-user')
      const userMessage: AgentMessage = {
        id: userMessageId,
        role: 'user',
        text: state.draft.trim() || '发送了资源',
        status: 'completed',
        createdAt: Date.now(),
        attachmentIds: state.pendingAttachments.map((attachment) => attachment.id),
        resourceIds: state.pendingResources.map((resource) => resource.id),
      }
      const session = get().sessionsById[sessionId]
      set((current) => ({
        draft: '',
        pendingAttachments: [],
        pendingResources: [],
        mentionedNodeIds: [],
        messagesById: { ...current.messagesById, [userMessageId]: userMessage },
        sessionsById: {
          ...current.sessionsById,
          [sessionId]: {
            ...session,
            title: session.title === '新对话'
              ? userMessage.text.slice(0, 24)
              : session.title,
            updatedAt: Date.now(),
            messageIds: [...session.messageIds, userMessageId],
          },
        },
      }))
      await runAssistant(
        sessionId,
        userMessage.text,
        runner,
        state.pendingAttachments,
        state.pendingResources,
      )
    },
    stop: (aborter = abortPiAgentPrompt) => {
      const state = get()
      if (!activeRunController || !state.activeAssistantMessageId) return
      set({ runStatus: 'stopping' })
      activeRunController.abort()
      void aborter(state.activeSessionId ?? '')
      const messageId = state.activeAssistantMessageId
      if (state.activeSessionId) {
        useAppBuilderStore.getState().cancelGeneration(state.activeSessionId)
      }
      set((current) => ({
        runStatus: 'idle',
        activeRunId: undefined,
        activeAssistantMessageId: undefined,
        messagesById: {
          ...current.messagesById,
          [messageId]: {
            ...current.messagesById[messageId],
            text: current.messagesById[messageId].text || '生成已停止。',
            status: 'stopped',
          },
        },
      }))
      activeRunController = undefined
    },
    retry: async (messageId, runner) => {
      const state = get()
      const message = state.messagesById[messageId]
      if (!message || message.role !== 'assistant' || state.runStatus !== 'idle') return
      const sessionId = state.activeSessionId
      if (!sessionId) return
      const session = state.sessionsById[sessionId]
      if (!session) return
      const previousUserMessageId = [...session.messageIds]
        .slice(0, session.messageIds.indexOf(messageId))
        .reverse()
        .find((id) => state.messagesById[id]?.role === 'user')
      const prompt = previousUserMessageId
        ? state.messagesById[previousUserMessageId].text
        : '请重新生成上一条回复。'
      await runAssistant(sessionId, prompt, runner)
    },

    setAutoScroll: (autoScroll) => set({ autoScroll }),
    markMessagesRead: () => set({ unreadCount: 0 }),
    resetConversation: () => {
      get().stop()
      const sessionId = get().activeSessionId
      if (!sessionId) return
      const session = get().sessionsById[sessionId]
      const messagesById = { ...get().messagesById }
      session.messageIds.forEach((messageId) => delete messagesById[messageId])
      set((state) => ({
        messagesById,
        sessionsById: {
          ...state.sessionsById,
          [sessionId]: { ...session, messageIds: [], updatedAt: Date.now() },
        },
        draft: '',
        pendingAttachments: [],
        pendingResources: [],
        runError: undefined,
      }))
    },
    reset: () => {
      activeRunController?.abort()
      activeRunController = undefined
      useAppBuilderStore.getState().reset()
      set({ ...initialState })
    },
  }
})

export const selectActiveSession = (state: AgentBoxStore) =>
  state.activeSessionId ? state.sessionsById[state.activeSessionId] : undefined

const emptyMessageIds: string[] = []

export const selectActiveMessageIds = (state: AgentBoxStore) =>
  selectActiveSession(state)?.messageIds ?? emptyMessageIds

export const selectIsRunning = (state: AgentBoxStore) =>
  state.runStatus === 'submitting'
  || state.runStatus === 'streaming'
  || state.runStatus === 'stopping'

export const selectCanSubmit = (state: AgentBoxStore) =>
  state.runStatus === 'idle'
  && (Boolean(state.draft.trim()) || state.pendingAttachments.length > 0 || state.pendingResources.length > 0)
