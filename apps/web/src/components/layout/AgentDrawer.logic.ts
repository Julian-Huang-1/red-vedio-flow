import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useMemo, useState } from 'react'
import { getUpstreamNodes, type MaterialNode } from '@red-video-flow/workflow-core'
import { fetchWorkflow, runNodeWithAgent } from '@red-video-flow/workflow-client'
import { useAgentsQuery, workflowQueryKeys } from '../../queries/workflowQueries'
import { useWorkflowStore } from '../../store/workflowStore'
import { useAnimatedPresence } from '../../ui/useAnimatedPresence'
import { applyAgentRunEvent, type ChatMessage } from './agentChatTypes'

const mentionPattern = /@([^\s@]+)/g

export function useAgentDrawer() {
  const queryClient = useQueryClient()
  const openWorkspacePanels = useWorkflowStore((state) => state.openWorkspacePanels)
  const closeWorkspacePanel = useWorkflowStore((state) => state.closeWorkspacePanel)
  const agents = useWorkflowStore((state) => state.agents)
  const agentStatus = useWorkflowStore((state) => state.agentStatus)
  const selectedAgentId = useWorkflowStore((state) => state.selectedAgentId)
  const selectedNodeId = useWorkflowStore((state) => state.selectedNodeId)
  const workflowId = useWorkflowStore((state) => state.workflowId)
  const workflowRevision = useWorkflowStore((state) => state.workflowRevision)
  const nodes = useWorkflowStore((state) => state.nodes)
  const edges = useWorkflowStore((state) => state.edges)
  const applyAgentsResponse = useWorkflowStore((state) => state.applyAgentsResponse)
  const setAgentQueryStatus = useWorkflowStore((state) => state.setAgentQueryStatus)
  const applyRemoteWorkflow = useWorkflowStore((state) => state.applyRemoteWorkflow)
  const selectAgent = useWorkflowStore((state) => state.selectAgent)
  const [prompt, setPrompt] = useState('')
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [isSending, setIsSending] = useState(false)
  const isOpen = openWorkspacePanels.includes('agent')
  const presence = useAnimatedPresence(isOpen)
  const agentsQuery = useAgentsQuery(isOpen)

  const selectedAgent = useMemo(
    () => agents.find((agent) => agent.id === selectedAgentId && agent.invokable),
    [agents, selectedAgentId],
  )
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

  const getReferencedNodes = (value: string) => {
    const titles = new Set<string>()
    for (const match of value.matchAll(mentionPattern)) titles.add(match[1])
    return nodes.filter((node) => titles.has(node.data.title) || titles.has(node.id))
  }

  const submit = async () => {
    const value = prompt.trim()
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

    const createdAt = Date.now()
    const assistantMessageId = `assistant-${createdAt}`

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
        id: assistantMessageId,
        role: 'assistant',
        text: '',
        status: 'pending',
        createdAt,
        updatedAt: createdAt,
        run: {
          agentId: selectedAgent.id,
          agentLabel: selectedAgent.label,
          stderr: [],
        },
      },
    ])
    setPrompt('')
    setIsSending(true)

    try {
      const conversationMessages = messages
        .filter((message) => message.text.trim())
        .map((message) => ({ role: message.role, text: message.text }))
      const referencedNodes = getReferencedNodes(value)
      const contextNode = selectedNode ?? referencedNodes[0]
      const node = contextNode ?? createDrawerChatNode()
      const output = await runNodeWithAgent(
        {
          agentId: selectedAgent.id,
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
      setMessages((current) =>
        current.map((message) =>
          message.id === assistantMessageId
            ? {
                ...message,
                text: displayOutput || message.text || (patchedByAgent ? '已写回当前节点。' : '已完成。'),
                status: 'completed',
                updatedAt: Date.now(),
                error: undefined,
              }
            : message,
        ),
      )
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
    } finally {
      setIsSending(false)
    }
  }

  return {
    agentStatus,
    agents,
    isMounted: presence.isMounted,
    isOpen,
    isSending,
    messages,
    nodes,
    presenceState: presence.state,
    prompt,
    selectedAgentId,
    hasSelectedNode: Boolean(selectedNode),
    close: () => closeWorkspacePanel('agent'),
    selectAgent,
    setPrompt,
    submit: () => void submit(),
  }
}

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
