import { useQueryClient } from '@tanstack/react-query'
import { Bot, ChevronDown, History, Paperclip, Send, Settings, Sparkles, TerminalSquare, X } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { getUpstreamNodes, type MaterialNode } from '@red-video-flow/workflow-core'
import { fetchWorkflow, runNodeWithAgent } from '@red-video-flow/workflow-client'
import { useAgentsQuery, workflowQueryKeys } from '../../queries/workflowQueries'
import { useWorkflowStore } from '../../store/workflowStore'
import styles from './AgentDrawer.module.less'

type ChatMessage = {
  id: string
  role: 'user' | 'assistant'
  text: string
}

const skillSuggestions = ['皮克斯动画广告', '爆款拉片复刻', '新中式美学TVC', '古典武侠电影全流程导演']
const mentionPattern = /@([^\s@]+)/g

export function AgentDrawer() {
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
  const applyWorkflow = useWorkflowStore((state) => state.applyWorkflow)
  const selectAgent = useWorkflowStore((state) => state.selectAgent)
  const [prompt, setPrompt] = useState('')
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [isSending, setIsSending] = useState(false)
  const [mentionQuery, setMentionQuery] = useState<string | undefined>(undefined)
  const [activeMentionIndex, setActiveMentionIndex] = useState(0)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const isDrawerOpen = openWorkspacePanels.includes('agent')
  const agentsQuery = useAgentsQuery(isDrawerOpen)
  const [shouldRenderDrawer, setShouldRenderDrawer] = useState(isDrawerOpen)

  const selectedAgent = useMemo(
    () => agents.find((agent) => agent.id === selectedAgentId && agent.invokable),
    [agents, selectedAgentId],
  )
  const selectedNode = useMemo(
    () => nodes.find((node) => node.id === selectedNodeId),
    [nodes, selectedNodeId],
  )
  const mentionOptions = useMemo(() => {
    const query = (mentionQuery ?? '').trim().toLowerCase()
    const options = query
      ? nodes.filter((node) => `${node.data.title} ${node.id}`.toLowerCase().includes(query))
      : nodes
    return options.slice(0, 8)
  }, [mentionQuery, nodes])

  useEffect(() => {
    if (isDrawerOpen) {
      setShouldRenderDrawer(true)
      return
    }

    const timeout = window.setTimeout(() => setShouldRenderDrawer(false), 220)
    return () => window.clearTimeout(timeout)
  }, [isDrawerOpen])

  useEffect(() => {
    if (!isDrawerOpen) return
    if (agentsQuery.isLoading) setAgentQueryStatus('loading')
    if (agentsQuery.isError) {
      setAgentQueryStatus('error', agentsQuery.error instanceof Error ? agentsQuery.error.message : String(agentsQuery.error))
    }
    if (agentsQuery.data) applyAgentsResponse(agentsQuery.data)
  }, [
    agentsQuery.data,
    agentsQuery.error,
    agentsQuery.isError,
    agentsQuery.isLoading,
    applyAgentsResponse,
    isDrawerOpen,
    setAgentQueryStatus,
  ])

  if (!shouldRenderDrawer) return null

  const updateMentionQuery = (value: string, caretIndex: number) => {
    const prefix = value.slice(0, caretIndex)
    const match = prefix.match(/(?:^|\s)@([^\s@]*)$/)
    setMentionQuery(match ? match[1] : undefined)
    setActiveMentionIndex(0)
  }

  const insertMention = (nodeId: string) => {
    const node = nodes.find((item) => item.id === nodeId)
    if (!node) return

    const textarea = textareaRef.current
    const caretIndex = textarea?.selectionStart ?? prompt.length
    const prefix = prompt.slice(0, caretIndex)
    const suffix = prompt.slice(caretIndex)
    const match = prefix.match(/(?:^|\s)@([^\s@]*)$/)
    const mentionText = `@${node.data.title}`

    const nextPrompt = match
      ? `${prefix.slice(0, match.index)}${match[0].startsWith(' ') ? ' ' : ''}${mentionText} ${suffix}`
      : `${prefix}${prefix.endsWith(' ') || !prefix ? '' : ' '}${mentionText} ${suffix}`
    const nextCaret = nextPrompt.indexOf(mentionText) + mentionText.length + 1

    setPrompt(nextPrompt)
    setMentionQuery(undefined)
    window.setTimeout(() => {
      textareaRef.current?.focus()
      textareaRef.current?.setSelectionRange(nextCaret, nextCaret)
    }, 0)
  }

  const getReferencedNodes = (value: string) => {
    const titles = new Set<string>()
    for (const match of value.matchAll(mentionPattern)) titles.add(match[1])
    return nodes.filter((node) => titles.has(node.data.title) || titles.has(node.id))
  }

  const submit = async () => {
    const value = prompt.trim()
    if (!value || isSending) return

    if (!selectedAgent) {
      setMessages((current) => [
        ...current,
        { id: `user-${Date.now()}`, role: 'user', text: value },
        { id: `assistant-${Date.now()}`, role: 'assistant', text: '没有可用的本地 Agent，请先安装或选择一个可调用 Agent。' },
      ])
      setPrompt('')
      return
    }

    const assistantMessageId = `assistant-${Date.now()}`

    setMessages((current) => [
      ...current,
      { id: `user-${Date.now()}`, role: 'user', text: value },
      { id: assistantMessageId, role: 'assistant', text: '' },
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
          onDelta: (text) => {
            setMessages((current) =>
              current.map((message) =>
                message.id === assistantMessageId
                  ? { ...message, text: `${message.text}${text}` }
                  : message,
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
            ? { ...message, text: displayOutput || message.text || (patchedByAgent ? '已写回当前节点。' : '已完成。') }
            : message,
        ),
      )
      if (patchedByAgent) {
        const workflow = await queryClient.fetchQuery({
          queryKey: workflowQueryKeys.workflow(workflowId),
          queryFn: () => fetchWorkflow(workflowId),
        })
        applyWorkflow(workflow)
      }
    } catch (error) {
      setMessages((current) =>
        current.map((message) =>
          message.id === assistantMessageId
            ? { ...message, text: `发送失败：${error instanceof Error ? error.message : String(error)}` }
            : message,
        ),
      )
    } finally {
      setIsSending(false)
    }
  }

  return (
    <aside
      className={`${styles.drawer} ${isDrawerOpen ? styles.drawerOpen : styles.drawerClosed}`}
      role="dialog"
      aria-label="Agent 助手"
      onPointerDown={(event) => event.stopPropagation()}
      onClick={(event) => event.stopPropagation()}
      onDoubleClick={(event) => event.stopPropagation()}
    >
      <header className={styles.header}>
        <div className={styles.title}>新对话</div>
        <div className={styles.headerActions}>
          <button title="历史对话">
            <History size={17} />
          </button>
          <button title="Agent 设置">
            <Settings size={17} />
          </button>
          <button title="CLI & Skill">
            <TerminalSquare size={17} />
          </button>
          <button title="关闭" onClick={() => closeWorkspacePanel('agent')}>
            <X size={18} />
          </button>
        </div>
      </header>

      <section className={styles.messages}>
        {messages.length === 0 ? (
          <div className={styles.emptyMessage}>
            <Bot size={28} />
            <p>可以询问如何拆解短视频工作流，或 @ 引用节点、资源来继续创作。</p>
          </div>
        ) : (
          messages.map((message) => (
            <div key={message.id} className={message.role === 'user' ? styles.userMessage : styles.assistantMessage}>
              {message.text}
            </div>
          ))
        )}
      </section>

      <section className={styles.skillBlock}>
        <div className={styles.blockTitle}>
          <span>选一个 Skill，让创作更快一步</span>
          <button>换一批</button>
        </div>
        <div className={styles.skillGrid}>
          {skillSuggestions.map((skill) => (
            <button key={skill}>
              <Sparkles size={15} />
              {skill}
            </button>
          ))}
        </div>
      </section>

      <footer className={styles.composer}>
        <textarea
          ref={textareaRef}
          value={prompt}
          placeholder="开始你的创作，或者 @ 引用工作流/节点/资源"
          onChange={(event) => {
            setPrompt(event.target.value)
            updateMentionQuery(event.target.value, event.target.selectionStart)
          }}
          onKeyDown={(event) => {
            if (event.nativeEvent.isComposing) return
            if (mentionQuery !== undefined && mentionOptions.length > 0) {
              if (event.key === 'ArrowDown') {
                event.preventDefault()
                setActiveMentionIndex((index) => (index + 1) % mentionOptions.length)
                return
              }
              if (event.key === 'ArrowUp') {
                event.preventDefault()
                setActiveMentionIndex((index) => (index - 1 + mentionOptions.length) % mentionOptions.length)
                return
              }
              if (event.key === 'Enter' || event.key === 'Tab') {
                event.preventDefault()
                insertMention(mentionOptions[activeMentionIndex]?.id)
                return
              }
              if (event.key === 'Escape') {
                event.preventDefault()
                setMentionQuery(undefined)
                return
              }
            }
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault()
              void submit()
            }
          }}
        />
        {mentionQuery !== undefined ? (
          <div className={styles.mentionMenu}>
            {mentionOptions.length ? (
              mentionOptions.map((node, index) => (
                <button
                  key={node.id}
                  type="button"
                  className={index === activeMentionIndex ? styles.mentionOptionActive : styles.mentionOption}
                  onMouseDown={(event) => {
                    event.preventDefault()
                    insertMention(node.id)
                  }}
                >
                  <span className={styles.mentionTitle}>{node.data.title}</span>
                  <span className={styles.mentionMeta}>{node.data.materialType}</span>
                </button>
              ))
            ) : (
              <div className={styles.mentionEmpty}>没有匹配节点</div>
            )}
          </div>
        ) : null}
        <div className={styles.composerFooter}>
          <button title="添加附件">
            <Paperclip size={17} />
          </button>
          <label className={styles.modelSelect}>
            <select
              value={selectedAgentId ?? ''}
              onChange={(event) => selectAgent(event.target.value)}
              disabled={agents.filter((agent) => agent.invokable).length === 0}
            >
              {agents.filter((agent) => agent.invokable).length === 0 ? (
                <option value="">本地 Agent</option>
              ) : (
                agents
                  .filter((agent) => agent.invokable)
                  .map((agent) => (
                    <option key={agent.id} value={agent.id}>
                      {agent.label}
                    </option>
                  ))
              )}
            </select>
            <ChevronDown size={14} />
          </label>
          <button className={styles.modeButton}>Skill</button>
          <button className={styles.modeButton}>{selectedNode ? '节点上下文' : '工作流助手'}</button>
          <button
            className={styles.sendButton}
            title="发送"
            disabled={!prompt.trim() || isSending}
            onClick={() => void submit()}
          >
            <Send size={17} />
          </button>
        </div>
      </footer>
    </aside>
  )
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
