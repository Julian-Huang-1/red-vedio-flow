import { useReactFlow } from '@xyflow/react'
import { Plus } from 'lucide-react'
import { useWorkflowStore } from '../../store/workflowStore'
import styles from './BottomToolbar.module.less'

export function BottomToolbar() {
  const { screenToFlowPosition } = useReactFlow()
  const openAddNodeMenu = useWorkflowStore((state) => state.openAddNodeMenu)

  const handleAddClick = (event: React.MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation()
    const screen = {
      x: window.innerWidth / 2 - 128,
      y: window.innerHeight - 330,
    }

    openAddNodeMenu(screen, screenToFlowPosition({ x: window.innerWidth / 2, y: window.innerHeight / 2 }))
  }

  return (
    <nav
      className={styles.toolbar}
      aria-label="工作流工具栏"
      onPointerDown={(event) => event.stopPropagation()}
      onClick={(event) => event.stopPropagation()}
      onDoubleClick={(event) => event.stopPropagation()}
    >
      <button className={styles.primaryButton} title="添加节点" onClick={handleAddClick}>
        <Plus size={23} />
      </button>
    </nav>
  )
}
