import { ChevronDown, Paperclip, RefreshCw, Send } from 'lucide-react'
import type {
  AgentModelDiscovery,
  AgentStatus,
  LocalAgent,
  LocalAgentModel,
} from '@red-video-flow/workflow-core'
import { useAgentComposer } from './AgentComposer.logic'
import { AgentComposerPrimitive as Composer } from './AgentComposer.primitives'
import { AgentMentionMenu, type MentionNode } from './AgentMentionMenu'

type Props = {
  value: string
  nodes: MentionNode[]
  agents: LocalAgent[]
  availableModels: LocalAgentModel[]
  modelDiscovery?: AgentModelDiscovery
  isDiscoveringModels: boolean
  agentStatus: AgentStatus
  selectedAgentId?: string
  selectedModelId?: string
  hasSelectedNode: boolean
  isSending: boolean
  onChange: (value: string) => void
  onAgentChange: (agentId: string) => void
  onModelChange: (modelId: string) => void
  onRefreshModels: () => void
  onSubmit: () => void
}

export function AgentComposer({
  value,
  nodes,
  agents,
  availableModels,
  modelDiscovery,
  isDiscoveringModels,
  agentStatus,
  selectedAgentId,
  selectedModelId,
  hasSelectedNode,
  isSending,
  onChange,
  onAgentChange,
  onModelChange,
  onRefreshModels,
  onSubmit,
}: Props) {
  const composer = useAgentComposer({ value, nodes, agents, onChange, onSubmit })
  return (
    <Composer.Root data-state={isSending ? 'sending' : 'idle'}>
      <Composer.Input
        inputRef={composer.textareaRef}
        value={value}
        placeholder="开始你的创作，或者 @ 引用工作流/节点/资源"
        onChange={composer.handleChange}
        onKeyDown={composer.handleKeyDown}
      />

      {composer.isMentionMenuOpen ? (
        <AgentMentionMenu
          nodes={composer.mentionOptions}
          activeIndex={composer.activeMentionIndex}
          onSelect={composer.insertMention}
        />
      ) : null}

      <Composer.Footer>
        <Composer.IconButton title="添加附件">
          <Paperclip size={17} />
        </Composer.IconButton>
        <Composer.ModelSelect>
          <select
            value={selectedAgentId ?? ''}
            onChange={(event) => onAgentChange(event.target.value)}
            disabled={agentStatus === 'loading' || composer.availableAgents.length === 0}
          >
            {composer.availableAgents.length === 0 ? (
              <option value="">{agentStatus === 'loading' ? '扫描中' : '本地 Agent'}</option>
            ) : (
              composer.availableAgents.map((agent) => (
                <option key={agent.id} value={agent.id}>
                  {agent.label}
                </option>
              ))
            )}
          </select>
          <ChevronDown size={14} />
        </Composer.ModelSelect>
        {availableModels.length > 0 ? (
          <Composer.ModelSelect>
            <select
              value={selectedModelId ?? 'default'}
              onChange={(event) => onModelChange(event.target.value)}
              aria-label="选择 Agent 模型"
              title={modelDiscovery?.warning ?? modelDiscoveryLabel(modelDiscovery?.source)}
            >
              {availableModels.filter((model) => model.available !== false).map((model) => (
                <option key={model.id} value={model.id}>
                  {model.label}
                </option>
              ))}
            </select>
            <ChevronDown size={14} />
          </Composer.ModelSelect>
        ) : null}
        {selectedAgentId ? (
          <Composer.IconButton
            title="重新发现当前 Agent 可用模型"
            data-state={isDiscoveringModels ? 'loading' : 'idle'}
            disabled={isDiscoveringModels}
            onClick={onRefreshModels}
          >
            <RefreshCw size={15} />
          </Composer.IconButton>
        ) : null}
        <Composer.ModeButton>Skill</Composer.ModeButton>
        <Composer.ModeButton>{hasSelectedNode ? '节点上下文' : '工作流助手'}</Composer.ModeButton>
        <Composer.SendButton
          title="发送"
          disabled={!value.trim() || isSending}
          onClick={onSubmit}
        >
          <Send size={17} />
        </Composer.SendButton>
      </Composer.Footer>
    </Composer.Root>
  )
}

function modelDiscoveryLabel(source?: AgentModelDiscovery['source']) {
  if (source === 'agent') return '模型来自当前 Agent CLI'
  if (source === 'cache') return '模型来自最近一次 Agent CLI 发现结果'
  return '模型来自插件静态候选'
}
