import { Clapperboard, FileText, Image, Library, Mic2, PanelsTopLeft, ScrollText, Video } from 'lucide-react'
import type { ElementType } from 'react'
import { useWorkflowStore } from '../../../store/workflowStore'
import type { MaterialType } from '@red-video-flow/workflow-core'
import styles from './AddNodeMenu.module.less'

type NodeItem = {
  materialType?: MaterialType
  label: string
  icon: ElementType
  tag?: string
}

const nodeItems: NodeItem[] = [
  { materialType: 'text', label: '文本', icon: FileText },
  { materialType: 'image', label: '图片', icon: Image },
  { materialType: 'video', label: '视频', icon: Video },
  { label: '视频合成', icon: Clapperboard, tag: 'Beta' },
  { label: '导演台', icon: PanelsTopLeft, tag: 'New' },
  { label: '音频', icon: Mic2, tag: '即将支持' },
  { label: '脚本', icon: ScrollText, tag: '即将支持' },
  { label: '素材库', icon: Library, tag: 'New' },
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
              className={`${styles.item} ${item.materialType ? '' : styles.disabledItem}`}
              onClick={() => {
                if (item.materialType) createNode(item.materialType)
              }}
              disabled={!item.materialType}
            >
              <Icon size={22} />
              <span>{item.label}</span>
              {item.tag ? <small>{item.tag}</small> : null}
            </button>
          )
        })}
      </div>
      <p className={styles.sectionTitle}>添加资源</p>
      <div className={styles.itemList}>
        <button className={styles.item} disabled>
          <Image size={22} />
          <span>上传</span>
          <small>节点内可用</small>
        </button>
        <button className={styles.item} disabled>
          <Library size={22} />
          <span>从生成历史选择</span>
          <small>即将支持</small>
        </button>
      </div>
    </div>
  )
}
