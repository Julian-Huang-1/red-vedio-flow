import { Clock3, HelpCircle, Library, Plus, Sparkles, UserRound } from 'lucide-react'
import { useWorkflowStore, type CanvasPanel } from '../../store/workflowStore'
import styles from './BottomToolbar.module.less'

const tools: Array<{ panel: CanvasPanel; label: string; icon: React.ElementType }> = [
  { panel: 'toolbox', label: '工具箱', icon: Sparkles },
  { panel: 'assets', label: '素材库', icon: Library },
  { panel: 'characters', label: '角色库', icon: UserRound },
  { panel: 'history', label: '历史记录', icon: Clock3 },
  { panel: 'shortcuts', label: '快捷键', icon: HelpCircle },
]

export function BottomToolbar() {
  const activePanel = useWorkflowStore((state) => state.activeCanvasPanel)
  const toggleCanvasPanel = useWorkflowStore((state) => state.toggleCanvasPanel)

  const handleAddClick = (event: React.MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation()
  }

  return (
    <nav
      className={styles.toolbar}
      aria-label="工作流工具栏"
      onPointerDown={(event) => event.stopPropagation()}
      onClick={(event) => event.stopPropagation()}
      onDoubleClick={(event) => event.stopPropagation()}
    >
      <button className={styles.primaryButton} title="右击画布添加节点" onClick={handleAddClick}>
        <Plus size={23} />
      </button>
      <div className={styles.toolGroup}>
        {tools.map((tool) => {
          const Icon = tool.icon
          return (
            <button
              key={tool.panel}
              className={activePanel === tool.panel ? styles.activeTool : styles.toolButton}
              title={tool.label}
              onClick={() => toggleCanvasPanel(tool.panel)}
            >
              <Icon size={20} />
            </button>
          )
        })}
      </div>
    </nav>
  )
}
