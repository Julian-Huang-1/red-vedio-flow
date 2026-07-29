import { Plus } from 'lucide-react'
import { useBottomToolbar } from './BottomToolbar.logic'
import { BottomToolbarPrimitive as Toolbar } from './BottomToolbar.primitives'

export function BottomToolbar() {
  const toolbar = useBottomToolbar()

  return (
    <Toolbar.Root
      onPointerDown={(event) => event.stopPropagation()}
      onClick={(event) => event.stopPropagation()}
      onDoubleClick={(event) => event.stopPropagation()}
    >
      <Toolbar.PrimaryAction
        title="添加节点"
        onClick={(event) => {
          event.stopPropagation()
          toolbar.addNode()
        }}
      >
        <Plus size={23} />
      </Toolbar.PrimaryAction>
      <Toolbar.Group>
        {toolbar.panels.map((panel) => {
          const Icon = panel.icon
          return (
            <Toolbar.Tool
              key={panel.id}
              active={toolbar.activePanel === panel.id}
              title={panel.title}
              onClick={() => toolbar.toggleCanvasPanel(panel.id)}
            >
              <Icon size={20} />
            </Toolbar.Tool>
          )
        })}
      </Toolbar.Group>
    </Toolbar.Root>
  )
}
