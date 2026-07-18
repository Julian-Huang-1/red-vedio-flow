import { FileText, Image, Video } from 'lucide-react'
import type { ElementType } from 'react'
import { useWorkflowStore } from '../../../store/workflowStore'
import type { MaterialType } from '@red-video-flow/workflow-core'
import styles from './AddNodeMenu.module.less'

const nodeItems: Array<{ materialType: MaterialType; label: string; icon: ElementType }> = [
  { materialType: 'text', label: '文本', icon: FileText },
  { materialType: 'image', label: '图片', icon: Image },
  { materialType: 'video', label: '视频', icon: Video },
]

export function AddNodeMenu() {
  const menu = useWorkflowStore((state) => state.addNodeMenu)
  const createNode = useWorkflowStore((state) => state.createNode)

  if (!menu.open) return null

  return (
    <div
      className={styles.menu}
      onPointerDown={(event) => event.stopPropagation()}
      onClick={(event) => event.stopPropagation()}
      onDoubleClick={(event) => event.stopPropagation()}
      style={{
        left: Math.min(menu.screenX, window.innerWidth - 280),
        top: Math.min(menu.screenY, window.innerHeight - 520),
      }}
    >
      <p className={styles.sectionTitle}>添加节点</p>
      <div className={styles.itemList}>
        {nodeItems.map((item) => {
          const Icon = item.icon
          return (
            <button
              key={item.label}
              className={styles.item}
              onClick={() => createNode(item.materialType)}
            >
              <Icon size={22} />
              <span>{item.label}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
