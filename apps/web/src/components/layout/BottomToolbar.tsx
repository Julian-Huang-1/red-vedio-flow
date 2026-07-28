import { Clock3, HelpCircle, Library, Plus, Sparkles, UserRound } from 'lucide-react'
import type { CanvasPanel } from '../../store/workflowStore'
import { useBottomToolbar } from './BottomToolbar.logic'
import { BottomToolbarPrimitive as Toolbar } from './BottomToolbar.primitives'

const tools: Array<{ panel: CanvasPanel; label: string; icon: React.ElementType }> = [
  { panel: 'toolbox', label: '工具箱', icon: Sparkles },
  { panel: 'assets', label: '素材库', icon: Library },
  { panel: 'characters', label: '角色库', icon: UserRound },
  { panel: 'history', label: '历史记录', icon: Clock3 },
  { panel: 'shortcuts', label: '快捷键', icon: HelpCircle },
]

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
        {tools.map((tool) => {
          const Icon = tool.icon
          return (
            <Toolbar.Tool
              key={tool.panel}
              active={toolbar.activePanel === tool.panel}
              title={tool.label}
              onClick={() => toolbar.toggleCanvasPanel(tool.panel)}
            >
              <Icon size={20} />
            </Toolbar.Tool>
          )
        })}
      </Toolbar.Group>
    </Toolbar.Root>
  )
}
