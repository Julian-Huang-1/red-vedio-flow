import { ChevronDown, Paperclip, Send } from 'lucide-react'
import type { AgentStatus, LocalAgent } from '@red-video-flow/workflow-core'
import { useAgentComposer } from './AgentComposer.logic'
import { AgentComposerPrimitive as Composer } from './AgentComposer.primitives'
import { AgentMentionMenu, type MentionNode } from './AgentMentionMenu'

type Props = {
  value: string
  nodes: MentionNode[]
  agents: LocalAgent[]
  agentStatus: AgentStatus
  selectedAgentId?: string
  hasSelectedNode: boolean
  isSending: boolean
  onChange: (value: string) => void
  onAgentChange: (agentId: string) => void
  onSubmit: () => void
}

export function AgentComposer({
  value,
  nodes,
  agents,
  agentStatus,
  selectedAgentId,
  hasSelectedNode,
  isSending,
  onChange,
  onAgentChange,
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
