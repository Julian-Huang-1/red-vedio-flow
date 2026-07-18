import { Bot, ChevronDown, History, Paperclip, Send, Settings, Sparkles, TerminalSquare, X } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useWorkflowStore } from '../../store/workflowStore'
import styles from './AgentDrawer.module.less'

type ChatMessage = {
  id: string
  role: 'user' | 'assistant'
  text: string
}

const skillSuggestions = ['皮克斯动画广告', '爆款拉片复刻', '新中式美学TVC', '古典武侠电影全流程导演']

export function AgentDrawer() {
  const openWorkspacePanels = useWorkflowStore((state) => state.openWorkspacePanels)
  const closeWorkspacePanel = useWorkflowStore((state) => state.closeWorkspacePanel)
  const agents = useWorkflowStore((state) => state.agents)
  const selectedAgentId = useWorkflowStore((state) => state.selectedAgentId)
  const selectAgent = useWorkflowStore((state) => state.selectAgent)
  const [prompt, setPrompt] = useState('')
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const isDrawerOpen = openWorkspacePanels.includes('agent')
  const [shouldRenderDrawer, setShouldRenderDrawer] = useState(isDrawerOpen)

  const selectedAgent = useMemo(
    () => agents.find((agent) => agent.id === selectedAgentId && agent.invokable),
    [agents, selectedAgentId],
  )

  useEffect(() => {
    if (isDrawerOpen) {
      setShouldRenderDrawer(true)
      return
    }

    const timeout = window.setTimeout(() => setShouldRenderDrawer(false), 220)
    return () => window.clearTimeout(timeout)
  }, [isDrawerOpen])

  if (!shouldRenderDrawer) return null

  const submit = () => {
    const value = prompt.trim()
    if (!value) return

    setMessages((current) => [
      ...current,
      { id: `user-${Date.now()}`, role: 'user', text: value },
      {
        id: `assistant-${Date.now()}`,
        role: 'assistant',
        text: '已收到。后续会把这里接到本地 Agent，并支持引用工作流、节点和资源。',
      },
    ])
    setPrompt('')
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
          value={prompt}
          placeholder="开始你的创作，或者 @ 引用工作流/节点/资源"
          onChange={(event) => setPrompt(event.target.value)}
          onKeyDown={(event) => {
            if (event.nativeEvent.isComposing) return
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault()
              submit()
            }
          }}
        />
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
          <button className={styles.modeButton}>{selectedAgent ? 'Agent' : '生成模式'}</button>
          <button className={styles.sendButton} title="发送" disabled={!prompt.trim()} onClick={submit}>
            <Send size={17} />
          </button>
        </div>
      </footer>
    </aside>
  )
}
