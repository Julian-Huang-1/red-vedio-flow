import type { MaterialType } from '@red-video-flow/workflow-core'
import { dataBoolean } from '../../ui/dataAttributes'
import styles from './AgentDrawer.module.less'

export type MentionNode = {
  id: string
  data: {
    title: string
    materialType: MaterialType
  }
}

type Props = {
  nodes: MentionNode[]
  activeIndex: number
  onSelect: (nodeId: string) => void
}

export function AgentMentionMenu({ nodes, activeIndex, onSelect }: Props) {
  return (
    <div className={styles.mentionMenu} role="listbox" aria-label="引用工作流节点">
      {nodes.length ? (
        nodes.map((node, index) => (
          <button
            key={node.id}
            type="button"
            role="option"
            aria-selected={index === activeIndex}
            className={styles.mentionOption}
            data-active={dataBoolean(index === activeIndex)}
            onMouseDown={(event) => {
              event.preventDefault()
              onSelect(node.id)
            }}
          >
            <span className={styles.mentionTitle}>{node.data.title}</span>
            <span className={styles.mentionMeta}>{node.data.materialType}</span>
          </button>
        ))
      ) : (
        <div className={styles.mentionEmpty}>没有匹配节点</div>
      )}
    </div>
  )
}
