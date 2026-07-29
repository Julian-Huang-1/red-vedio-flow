import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useMemo, useRef, useState } from 'react'
import { getUpstreamNodes, type MaterialNode } from '@red-video-flow/workflow-core'
import {
  createChatSession,
  createAgentModelUpdateToken,
  createAgentRegistrationToken,
  deleteChatSession,
  fetchAgentModels,
  fetchChatSession,
  fetchChatSessions,
  fetchWorkflow,
  renameChatSession,
  runNodeWithAgent,
  saveChatMessage,
  type ChatSession,
  type PersistedChatMessage,
} from '@red-video-flow/workflow-client'
import { useAgentModelsQuery, useAgentsQuery, workflowQueryKeys } from '../../queries/workflowQueries'
import { useAgentCatalogStore } from '../../state/agentCatalogStore'
import { useAgentSessionStore } from '../../state/agentSessionStore'
import { useCanvasUiStore } from '../../state/canvasUiStore'
import { useWorkflowStore } from '../../store/workflowStore'
import { useAnimatedPresence } from '../../ui/useAnimatedPresence'
import { applyAgentRunEvent, type ChatMessage } from './agentChatTypes'

const mentionPattern = /@([^\s@]+)/g

export function useAgentDrawer() {
  const queryClient = useQueryClient()
  const openWorkspacePanels = useCanvasUiStore((state) => state.openWorkspacePanels)
  const closeWorkspacePanel = useCanvasUiStore((state) => state.closeWorkspacePanel)
  const agents = useAgentCatalogStore((state) => state.agents)
  const agentStatus = useAgentCatalogStore((state) => state.status)
  const selectedAgentId = useAgentCatalogStore((state) => state.selectedAgentId)
  const selectedNodeId = useCanvasUiStore((state) => state.selectedNodeId)
  const workflowId = useWorkflowStore((state) => state.workflowId)
  const workflowRevision = useWorkflowStore((state) => state.workflowRevision)
  const nodes = useWorkflowStore((state) => state.nodes)
  const edges = useWorkflowStore((state) => state.edges)
  const applyAgentsResponse = useAgentCatalogStore((state) => state.applyResponse)
  const setAgentQueryStatus = useAgentCatalogStore((state) => state.setQueryStatus)
  const applyRemoteWorkflow = useWorkflowStore((state) => state.applyRemoteWorkflow)
  const selectAgent = useAgentCatalogStore((state) => state.selectAgent)
  const prompt = useAgentSessionStore((state) => state.prompt)
  const messages = useAgentSessionStore((state) => state.messages)
  const isSending = useAgentSessionStore((state) => state.isSending)
  const setPrompt = useAgentSessionStore((state) => state.setPrompt)
  const setMessages = useAgentSessionStore((state) => state.setMessages)
  const setIsSending = useAgentSessionStore((state) => state.setSending)
  const sessionId = useAgentSessionStore((state) => state.sessionId)
  const selectedModelId = useAgentSessionStore((state) => state.selectedModelId)
  const setSessionId = useAgentSessionStore((state) => state.setSessionId)
  const setSelectedModelId = useAgentSessionStore((state) => state.setSelectedModelId)
  const resetSession = useAgentSessionStore((state) => state.reset)
  const isOpen = openWorkspacePanels.includes('agent')
  const presence = useAnimatedPresence(isOpen)
  const agentsQuery = useAgentsQuery(isOpen)
  const [isCopyingRegistrationPrompt, setCopyingRegistrationPrompt] = useState(false)
  const [copiedAgentId, setCopiedAgentId] = useState<string>()
  const [registrationError, setRegistrationError] = useState<string>()
  const [sessions, setSessions] = useState<ChatSession[]>([])
  const [isHistoryOpen, setHistoryOpen] = useState(false)
  const [historyQuery, setHistoryQuery] = useState('')
  const [historyError, setHistoryError] = useState<string>()
  const sessionWorkflowIdRef = useRef(workflowId)

  const selectedAgent = useMemo(
    () => agents.find((agent) => agent.id === selectedAgentId && agent.invokable),
    [agents, selectedAgentId],
  )
  const agentModelsQuery = useAgentModelsQuery(
    selectedAgent?.id,
    isOpen && selectedAgent?.discoverySource === 'registered',
  )
  const availableModels = agentModelsQuery.data?.models ?? selectedAgent?.fallbackModels ?? []
  const modelDiscovery = agentModelsQuery.data ?? selectedAgent?.modelDiscovery
  const selectedNode = useMemo(
    () => nodes.find((node) => node.id === selectedNodeId),
    [nodes, selectedNodeId],
  )

  useEffect(() => {
    if (!isOpen) return
    if (agentsQuery.isLoading) setAgentQueryStatus('loading')
    if (agentsQuery.isError) {
      setAgentQueryStatus(
        'error',
        agentsQuery.error instanceof Error ? agentsQuery.error.message : String(agentsQuery.error),
      )
    }
    if (agentsQuery.data) applyAgentsResponse(agentsQuery.data)
  }, [
    agentsQuery.data,
    agentsQuery.error,
    agentsQuery.isError,
    agentsQuery.isLoading,
    applyAgentsResponse,
    isOpen,
    setAgentQueryStatus,
  ])

  useEffect(() => {
    if (!availableModels.length) return
    const selectedStillAvailable = availableModels.some(
      (model) => model.id === selectedModelId && model.available !== false,
    )
    if (!selectedStillAvailable) {
      setSelectedModelId(
        agentModelsQuery.data?.defaultModelId
          ?? availableModels.find((model) => model.available !== false)?.id
          ?? 'default',
      )
    }
  }, [agentModelsQuery.data?.defaultModelId, availableModels, selectedModelId, setSelectedModelId])

  const refreshSessions = async (query = historyQuery) => {
    try {
      setHistoryError(undefined)
      const result = await fetchChatSessions(workflowId, query)
      setSessions(result.sessions)
    } catch (error) {
      setHistoryError(error instanceof Error ? error.message : String(error))
    }
  }

  useEffect(() => {
    if (sessionWorkflowIdRef.current !== workflowId) {
      sessionWorkflowIdRef.current = workflowId
      resetSession()
    }
    if (isOpen) void refreshSessions()
  }, [isOpen, workflowId])

  const getReferencedNodes = (value: string) => {
    const titles = new Set<string>()
    for (const match of value.matchAll(mentionPattern)) titles.add(match[1])
    return nodes.filter((node) => titles.has(node.data.title) || titles.has(node.id))
  }

  const submit = async (options: {
    value?: string
    forceNewSession?: boolean
    sessionTitle?: string
    detached?: boolean
    refreshModelsForAgentId?: string
  } = {}) => {
    const value = (options.value ?? prompt).trim()
    if (!value || isSending) return

    if (!selectedAgent) {
      const createdAt = Date.now()
      setMessages((current) => [
        ...current,
        {
          id: `user-${createdAt}`,
          role: 'user',
          text: value,
          status: 'completed',
          createdAt,
          updatedAt: createdAt,
        },
        {
          id: `assistant-${createdAt}`,
          role: 'assistant',
          text: '',
          status: 'error',
          createdAt,
          updatedAt: createdAt,
          error: '没有可用的本地 Agent，请先安装或选择一个可调用 Agent。',
        },
      ])
      setPrompt('')
      return
    }

    let activeSessionId = options.forceNewSession ? undefined : sessionId
    if (!activeSessionId) {
      try {
        const created = await createChatSession({
          workflowId,
          title: options.sessionTitle,
        })
        activeSessionId = created.session.id
        setSessionId(activeSessionId)
        if (options.forceNewSession) {
          setHistoryOpen(false)
          setMessages([])
        }
      } catch (error) {
        setHistoryError(error instanceof Error ? error.message : String(error))
        return
      }
    }
    const createdAt = Date.now()
    const assistantMessageId = `assistant-${createdAt}`

    const nextMessages: ChatMessage[] = [
      {
        id: `user-${createdAt}`,
        role: 'user',
        text: value,
        status: 'completed',
        createdAt,
        updatedAt: createdAt,
      },
      {
        id: assistantMessageId,
        role: 'assistant',
        text: '',
        status: 'pending',
        createdAt,
        updatedAt: createdAt,
        run: {
          agentId: selectedAgent.id,
          agentLabel: selectedAgent.label,
          modelId: selectedModelId,
          stderr: [],
        },
      },
    ]
    setMessages((current) => [
      ...(options.forceNewSession ? [] : current),
      ...nextMessages,
    ])
    setPrompt('')
    setIsSending(true)
    const userMessage = {
      id: `user-${createdAt}`,
      role: 'user' as const,
      text: value,
      status: 'completed' as const,
      createdAt,
      updatedAt: createdAt,
    }
    let assistantMessage: ChatMessage = {
      id: assistantMessageId,
      role: 'assistant' as const,
      text: '',
      status: 'pending' as const,
      createdAt,
      updatedAt: createdAt,
      run: {
        agentId: selectedAgent.id,
        agentLabel: selectedAgent.label,
        modelId: selectedModelId,
        stderr: [] as string[],
      },
    }

    try {
      await Promise.all([
        persistMessage(activeSessionId, userMessage),
        persistMessage(activeSessionId, assistantMessage),
      ])
      const conversationMessages = (options.forceNewSession ? [] : messages)
        .filter((message) => message.text.trim())
        .map((message) => ({ role: message.role, text: message.text }))
      const referencedNodes = options.detached ? [] : getReferencedNodes(value)
      const contextNode = options.detached ? undefined : selectedNode ?? referencedNodes[0]
      const node = contextNode ?? createDrawerChatNode()
      const output = await runNodeWithAgent(
        {
          agentId: selectedAgent.id,
          model: selectedModelId === 'default' ? undefined : selectedModelId,
          mode: 'chat',
          node,
          upstream: contextNode ? getUpstreamNodes(nodes, edges, contextNode.id) : [],
          referencedNodes,
          edges,
          prompt: value,
          messages: conversationMessages,
          workflowId: contextNode ? workflowId : undefined,
          workflowRevision,
        },
        {
          onEvent: (event) => {
            assistantMessage = applyAgentRunEvent(assistantMessage, event)
            setMessages((current) =>
              current.map((message) =>
                message.id === assistantMessageId ? applyAgentRunEvent(message, event) : message,
              ),
            )
          },
        },
      )

      const patchedByAgent = output.includes('RVF_WORKFLOW_PATCHED')
      const displayOutput = output.replace(/RVF_WORKFLOW_PATCHED/g, '').trim()
      assistantMessage = {
        ...assistantMessage,
        text: displayOutput
          || assistantMessage.text
          || (patchedByAgent ? '已写回当前节点。' : '已完成。'),
        status: 'completed',
        updatedAt: Date.now(),
        error: undefined,
      }
      setMessages((current) =>
        current.map((message) =>
          message.id === assistantMessageId
            ? {
                ...message,
                text: displayOutput
                  || message.text
                  || (patchedByAgent ? '已写回当前节点。' : '已完成。'),
                status: 'completed',
                updatedAt: Date.now(),
                error: undefined,
              }
            : message,
        ),
      )
      await persistMessage(activeSessionId, assistantMessage)
      await refreshSessions()
      if (options.refreshModelsForAgentId) {
        const result = await fetchAgentModels(options.refreshModelsForAgentId)
        queryClient.setQueryData(
          workflowQueryKeys.agentModels(options.refreshModelsForAgentId),
          result,
        )
      }
      if (patchedByAgent) {
        const workflow = await queryClient.fetchQuery({
          queryKey: workflowQueryKeys.workflow(workflowId),
          queryFn: () => fetchWorkflow(workflowId),
          staleTime: 0,
        })
        applyRemoteWorkflow(workflow)
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      assistantMessage = {
        ...assistantMessage,
        status: 'error',
        updatedAt: Date.now(),
        error: errorMessage,
      }
      setMessages((current) =>
        current.map((message) =>
          message.id === assistantMessageId
            ? {
                ...message,
                status: 'error',
                updatedAt: Date.now(),
                error: errorMessage,
                run: message.run
                  ? { ...message.run, finishedAt: message.run.finishedAt ?? Date.now() }
                  : message.run,
              }
            : message,
        ),
      )
      await persistMessage(activeSessionId, assistantMessage).catch(() => undefined)
      await refreshSessions()
    } finally {
      setIsSending(false)
    }
  }

  const openSession = async (id: string) => {
    if (isSending) return
    try {
      const result = await fetchChatSession(id)
      setSessionId(id)
      setMessages(result.messages.map(fromPersistedMessage))
      setPrompt('')
      setHistoryOpen(false)
    } catch (error) {
      setHistoryError(error instanceof Error ? error.message : String(error))
    }
  }

  const createSession = () => {
    if (isSending) return
    resetSession()
    setHistoryOpen(false)
  }

  const renameSession = async (id: string, currentTitle: string) => {
    const title = window.prompt('重命名对话', currentTitle)?.trim()
    if (!title) return
    await renameChatSession(id, title)
    await refreshSessions()
  }

  const removeSession = async (id: string) => {
    if (!window.confirm('删除这段历史对话？此操作不可撤销。')) return
    await deleteChatSession(id)
    if (sessionId === id) resetSession()
    await refreshSessions()
  }

  const copyRegistrationPrompt = async (agentId: string) => {
    if (isCopyingRegistrationPrompt) return
    setCopyingRegistrationPrompt(true)
    setRegistrationError(undefined)
    try {
      const grant = await createAgentRegistrationToken(agentId)
      await navigator.clipboard.writeText(grant.prompt)
      setCopiedAgentId(agentId)
      window.setTimeout(() => setCopiedAgentId(undefined), 2_500)
    } catch (error) {
      setRegistrationError(error instanceof Error ? error.message : String(error))
    } finally {
      setCopyingRegistrationPrompt(false)
    }
  }

  const refreshModels = async () => {
    if (!selectedAgent || isSending) return
    try {
      const grant = await createAgentModelUpdateToken(selectedAgent.id)
      await submit({
        value: grant.prompt,
        forceNewSession: true,
        sessionTitle: `${selectedAgent.label} 模型发现`,
        detached: true,
        refreshModelsForAgentId: selectedAgent.id,
      })
    } catch (error) {
      setHistoryError(error instanceof Error ? error.message : String(error))
    }
  }

  return {
    agentStatus,
    agents,
    isMounted: presence.isMounted,
    isOpen,
    isSending,
    isCopyingRegistrationPrompt,
    messages,
    nodes,
    presenceState: presence.state,
    prompt,
    selectedAgentId,
    copiedAgentId,
    registrationError,
    sessions,
    sessionId,
    selectedModelId,
    availableModels,
    modelDiscovery,
    isDiscoveringModels: agentModelsQuery.isFetching || isSending,
    isHistoryOpen,
    historyQuery,
    historyError,
    hasSelectedNode: Boolean(selectedNode),
    close: () => closeWorkspacePanel('agent'),
    selectAgent: (agentId: string) => {
      selectAgent(agentId)
      setSelectedModelId('default')
    },
    selectModel: setSelectedModelId,
    refreshModels: () => void refreshModels(),
    toggleHistory: () => setHistoryOpen((open) => !open),
    setHistoryQuery: (query: string) => {
      setHistoryQuery(query)
      void refreshSessions(query)
    },
    openSession: (id: string) => void openSession(id),
    createSession,
    renameSession: (id: string, title: string) => void renameSession(id, title),
    removeSession: (id: string) => void removeSession(id),
    copyRegistrationPrompt: (agentId: string) => void copyRegistrationPrompt(agentId),
    setPrompt,
    submit: () => void submit(),
  }
}

function persistMessage(sessionId: string, message: ChatMessage) {
  return saveChatMessage(sessionId, {
    id: message.id,
    kind: message.kind ?? 'text',
    role: message.role,
    text: message.text,
    status: message.status,
    agentId: message.run?.agentId,
    agentLabel: message.run?.agentLabel,
    modelId: message.run?.modelId,
    error: message.error,
    run: message.run,
    createdAt: message.createdAt,
    updatedAt: message.updatedAt,
  })
}

function fromPersistedMessage(message: PersistedChatMessage): ChatMessage {
  return {
    id: message.id,
    kind: message.kind,
    role: message.role,
    text: message.text,
    status: message.status,
    error: message.error,
    run: message.run as ChatMessage['run'],
    createdAt: message.createdAt,
    updatedAt: message.updatedAt,
  }
}

export type AgentDrawerController = ReturnType<typeof useAgentDrawer>

function createDrawerChatNode(): MaterialNode {
  return {
    id: 'drawer-chat',
    position: { x: 0, y: 0 },
    data: {
      materialType: 'text',
      title: '侧边栏 Agent 对话',
      status: 'ready',
      value: {},
      messages: [],
    },
  }
}
