import { useAgentDrawer } from './AgentDrawer.logic'
import { AgentDrawerPrimitive as Drawer } from './AgentDrawer.primitives'
import { ExtensionSlot } from '../../extension-system/ExtensionSlot'

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
      <ExtensionSlot name="agent.drawer.header" slotProps={{ drawer }} />
      <ExtensionSlot name="agent.drawer.messages" slotProps={{ drawer }} />
      <ExtensionSlot name="agent.drawer.context" slotProps={{ drawer }} />
      <ExtensionSlot name="agent.drawer.composer.before" slotProps={{ drawer }} />
      <ExtensionSlot name="agent.drawer.composer" slotProps={{ drawer }} />
      <ExtensionSlot name="agent.drawer.composer.actions" slotProps={{ drawer }} />
      <ExtensionSlot name="agent.drawer.status" slotProps={{ drawer }} />
      <ExtensionSlot name="agent.drawer.footer" slotProps={{ drawer }} />
    </Drawer.Root>
  )
}
