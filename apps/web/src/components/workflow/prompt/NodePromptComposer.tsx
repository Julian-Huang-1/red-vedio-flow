import { type Node, useViewport } from '@xyflow/react'
import { ArrowUp, Bot, FileText, Image, Play, X } from 'lucide-react'
import { type ElementType, useEffect, useMemo, useRef, useState } from 'react'
import type { MaterialNodeData, MaterialType } from '@red-video-flow/workflow-core'
import { fetchVisualModels } from '@red-video-flow/workflow-client'
import { useWorkflowStore } from '../../../store/workflowStore'
import styles from './NodePromptComposer.module.less'

const icons: Record<MaterialType, ElementType> = {
  text: FileText,
  image: Image,
  video: Play,
}

const placeholders: Record<MaterialType, string> = {
  text: '给 AI 的生成指令。例如：扩写成 60 秒都市逆袭短剧脚本。',
  image: '描述要生成或修改的画面。例如：女主站在雨夜写字楼门口，电影感，竖屏。',
  video: '描述视频动作和镜头。例如：镜头缓慢推进，女主抬头看向镜头，6 秒。',
}

type Props = {
  node: Node<MaterialNodeData, 'material'>
}

export function NodePromptComposer({ node }: Props) {
  const viewport = useViewport()
  const [prompt, setPrompt] = useState('')
  const [visualModelLabel, setVisualModelLabel] = useState('即梦 Dreamina')
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const agents = useWorkflowStore((state) => state.agents)
  const selectedAgentId = useWorkflowStore((state) => state.selectedAgentId)
  const agentStatus = useWorkflowStore((state) => state.agentStatus)
  const selectAgent = useWorkflowStore((state) => state.selectAgent)
  const loadAgents = useWorkflowStore((state) => state.loadAgents)
  const closeComposer = useWorkflowStore((state) => state.closeComposer)
  const runNode = useWorkflowStore((state) => state.runNode)
  const Icon = icons[node.data.materialType]
  const availableAgents = agents.filter((agent) => agent.invokable)
  const isVisualNode = node.data.materialType === 'image' || node.data.materialType === 'video'
  const sendDisabled = node.data.status === 'running' || !prompt.trim()

  const style = useMemo(() => {
    const width = Math.max(node.width ?? 520, 520)
    const height = 220
    const gap = 34
    const nodeHeight = node.height ?? 260
    const visibleBottom = (window.innerHeight - viewport.y) / viewport.zoom
    const belowY = node.position.y + nodeHeight + gap
    const aboveY = Math.max(node.position.y - height - gap, 24)
    const y = belowY + height > visibleBottom ? aboveY : belowY

    return {
      transform: `translate(${node.position.x}px, ${y}px)`,
      width,
    }
  }, [node.height, node.position.x, node.position.y, node.width, viewport.x, viewport.y, viewport.zoom])

  const submit = async () => {
    const value = prompt.trim()
    if (!value) return
    await runNode(node.id, value, selectedAgentId)
    setPrompt('')
  }

  useEffect(() => {
    if (agentStatus === 'idle') void loadAgents()
  }, [agentStatus, loadAgents])

  useEffect(() => {
    if (!isVisualNode) return
    void fetchVisualModels()
      .then((response) => {
        const model = response.models.find((item) => item.invokable) ?? response.models[0]
        setVisualModelLabel(model ? model.label : '视觉模型')
      })
      .catch(() => setVisualModelLabel('视觉模型'))
  }, [isVisualNode])

  useEffect(() => {
    setPrompt('')
  }, [node.id])

  useEffect(() => {
    window.setTimeout(() => textareaRef.current?.focus(), 0)
  }, [node.id])

  useEffect(() => {
    const focusComposer = (event: Event) => {
      const customEvent = event as CustomEvent<{ nodeId: string }>
      if (customEvent.detail?.nodeId === node.id) {
        textareaRef.current?.focus()
      }
    }

    window.addEventListener('focus-node-composer', focusComposer)
    return () => window.removeEventListener('focus-node-composer', focusComposer)
  }, [node.id])

  return (
    <div
      className={`${styles.composer} nodrag nopan`}
      data-node-composer="true"
      style={style}
      onMouseDown={(event) => event.stopPropagation()}
      onMouseUp={(event) => event.stopPropagation()}
      onPointerDown={(event) => event.stopPropagation()}
      onPointerUp={(event) => event.stopPropagation()}
      onClick={(event) => event.stopPropagation()}
      onDoubleClick={(event) => event.stopPropagation()}
    >
      <button className={styles.closeButton} title="关闭" onClick={closeComposer}>
        <X size={20} />
      </button>
      <div className={styles.nodeBadge}>
        <span className={styles.counter}>1</span>
        <Icon size={27} />
      </div>
      <textarea
        ref={textareaRef}
        className={`${styles.promptInput} nodrag nopan`}
        value={prompt}
        placeholder={placeholders[node.data.materialType]}
        autoFocus
        onMouseDown={(event) => event.stopPropagation()}
        onPointerDown={(event) => event.stopPropagation()}
        onClick={(event) => event.stopPropagation()}
        onChange={(event) => setPrompt(event.target.value)}
        onKeyDown={(event) => {
          if (event.nativeEvent.isComposing) return
          if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault()
            void submit()
            return
          }
          if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
            void submit()
          }
        }}
      />
      <footer className={styles.footer}>
        <div className={styles.footerMeta}>
          {isVisualNode ? (
            <span className={styles.visualModel}>
              <Bot size={16} />
              {visualModelLabel}
            </span>
          ) : (
            <label className={styles.agentSelect}>
              <Bot size={16} />
              <select
                value={selectedAgentId ?? ''}
                disabled={agentStatus === 'loading' || availableAgents.length === 0}
                onChange={(event) => selectAgent(event.target.value)}
                aria-label="选择本地 Agent"
              >
                {availableAgents.length === 0 ? (
                  <option value="">{agentStatus === 'loading' ? '扫描中' : '本地 Agent'}</option>
                ) : (
                  availableAgents.map((agent) => (
                    <option key={agent.id} value={agent.id}>
                      {agent.label}
                    </option>
                  ))
                )}
              </select>
            </label>
          )}
        </div>
        <div className={styles.footerActions}>
          <button
            className={styles.sendButton}
            aria-label="提交内容"
            onPointerDown={(event) => event.stopPropagation()}
            onClick={(event) => {
              event.stopPropagation()
              void submit()
            }}
            disabled={sendDisabled}
          >
            <ArrowUp size={24} />
          </button>
        </div>
      </footer>
    </div>
  )
}
