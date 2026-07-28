import { AgentComposer } from './AgentComposer'
import { AgentDrawerHeader } from './AgentDrawerHeader'
import { useAgentDrawer } from './AgentDrawer.logic'
import { AgentDrawerPrimitive as Drawer } from './AgentDrawer.primitives'
import { AgentMessageList } from './AgentMessageList'
import { AgentSkillPicker } from './AgentSkillPicker'

const skillSuggestions = ['皮克斯动画广告', '爆款拉片复刻', '新中式美学TVC', '古典武侠电影全流程导演']

export function AgentDrawer() {
  const drawer = useAgentDrawer()

  if (!drawer.isMounted) return null

  return (
    <Drawer.Root
      data-state={drawer.presenceState}
      onPointerDown={(event) => event.stopPropagation()}
      onClick={(event) => event.stopPropagation()}
      onDoubleClick={(event) => event.stopPropagation()}
    >
      <AgentDrawerHeader onClose={drawer.close} />
      <AgentMessageList messages={drawer.messages} isActive={drawer.isOpen} />
      <AgentSkillPicker suggestions={skillSuggestions} />
      <AgentComposer
        value={drawer.prompt}
        nodes={drawer.nodes}
        agents={drawer.agents}
        agentStatus={drawer.agentStatus}
        selectedAgentId={drawer.selectedAgentId}
        hasSelectedNode={drawer.hasSelectedNode}
        isSending={drawer.isSending}
        onChange={drawer.setPrompt}
        onAgentChange={drawer.selectAgent}
        onSubmit={drawer.submit}
      />
    </Drawer.Root>
  )
}
