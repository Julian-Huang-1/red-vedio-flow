import { useCanvasToolRail } from './CanvasToolRail.logic'
import { CanvasToolRailPrimitive as Panel } from './CanvasToolRail.primitives'

export function CanvasToolRail() {
  const panel = useCanvasToolRail()

  if (!panel.activePanel || !panel.panel) return null
  const Content = panel.panel.component

  return (
    <Panel.Root
      data-panel={panel.activePanel}
      onPointerDown={(event) => event.stopPropagation()}
      onClick={(event) => event.stopPropagation()}
      onDoubleClick={(event) => event.stopPropagation()}
    >
      <Panel.Header>
        <h2>{panel.panel.title}</h2>
        <Panel.Close onClick={panel.close}>×</Panel.Close>
      </Panel.Header>
      <Content />
    </Panel.Root>
  )
}
