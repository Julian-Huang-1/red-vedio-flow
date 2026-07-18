import {
  Boxes,
  ChevronDown,
  FileText,
  Image,
  LocateFixed,
  MoreHorizontal,
  PanelLeftClose,
  Search,
  Video,
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useReactFlow } from '@xyflow/react'
import type { MaterialType } from '@red-video-flow/workflow-core'
import { useWorkflowStore } from '../../store/workflowStore'
import styles from './AssetManager.module.less'

const typeLabels: Record<MaterialType, string> = {
  text: '文本',
  image: '图片',
  video: '视频',
}

const typeIcons = {
  text: FileText,
  image: Image,
  video: Video,
}

export function AssetManager() {
  const { setCenter } = useReactFlow()
  const nodes = useWorkflowStore((state) => state.nodes)
  const workflowTitle = useWorkflowStore((state) => state.workflowTitle)
  const openWorkspacePanels = useWorkflowStore((state) => state.openWorkspacePanels)
  const toggleWorkspacePanel = useWorkflowStore((state) => state.toggleWorkspacePanel)
  const closeWorkspacePanel = useWorkflowStore((state) => state.closeWorkspacePanel)
  const selectNode = useWorkflowStore((state) => state.selectNode)
  const [tab, setTab] = useState<'canvas' | 'assets'>('canvas')
  const [filter, setFilter] = useState<'all' | MaterialType>('all')
  const [query, setQuery] = useState('')
  const isPanelOpen = openWorkspacePanels.includes('assetManager')
  const [shouldRenderPanel, setShouldRenderPanel] = useState(isPanelOpen)

  useEffect(() => {
    if (isPanelOpen) {
      setShouldRenderPanel(true)
      return
    }

    const timeout = window.setTimeout(() => setShouldRenderPanel(false), 220)
    return () => window.clearTimeout(timeout)
  }, [isPanelOpen])

  const filteredNodes = useMemo(() => {
    const keyword = query.trim().toLowerCase()
    return nodes.filter((node) => {
      const typeMatched = filter === 'all' || node.data.materialType === filter
      const queryMatched = !keyword || node.data.title.toLowerCase().includes(keyword)
      return typeMatched && queryMatched
    })
  }, [filter, nodes, query])

  const locateNode = (nodeId: string) => {
    const node = nodes.find((item) => item.id === nodeId)
    if (!node) return
    selectNode(node.id)
    setCenter(node.position.x + (node.width ?? 360) / 2, node.position.y + (node.height ?? 220) / 2, {
      zoom: 0.92,
      duration: 360,
    })
  }

  return (
    <>
      <button
        className={styles.entryButton}
        title="资产管理"
        onClick={(event) => {
          event.stopPropagation()
          toggleWorkspacePanel('assetManager')
        }}
      >
        <Boxes size={19} />
        资产管理
      </button>

      {shouldRenderPanel ? (
        <aside
          className={`${styles.panel} ${isPanelOpen ? styles.panelOpen : styles.panelClosed}`}
          role="dialog"
          aria-label="资产管理"
          onPointerDown={(event) => event.stopPropagation()}
          onClick={(event) => event.stopPropagation()}
          onDoubleClick={(event) => event.stopPropagation()}
        >
          <header className={styles.header}>
            <div className={styles.brandRow}>
              <span className={styles.logoMark} />
            </div>
            <div className={styles.workspaceLine}>
              <input value={workflowTitle} readOnly aria-label="项目名称" />
              <button>
                画布 1
                <ChevronDown size={14} />
              </button>
            </div>
          </header>

          <div className={styles.tabs}>
            <button className={tab === 'canvas' ? styles.activeTab : ''} onClick={() => setTab('canvas')}>
              画布
            </button>
            <button className={tab === 'assets' ? styles.activeTab : ''} onClick={() => setTab('assets')}>
              资产
            </button>
          </div>

          {tab === 'canvas' ? (
            <>
              <section className={styles.controls}>
                <div className={styles.sectionTitle}>画布元素</div>
                <label className={styles.filterButton} title="筛选类型">
                  <select value={filter} onChange={(event) => setFilter(event.target.value as typeof filter)}>
                    <option value="all">全部</option>
                    <option value="text">文本</option>
                    <option value="image">图片</option>
                    <option value="video">视频</option>
                  </select>
                </label>
                <label className={styles.searchBox}>
                  <Search size={15} />
                  <input value={query} placeholder="搜索节点" onChange={(event) => setQuery(event.target.value)} />
                </label>
              </section>

              <div className={styles.nodeList}>
                {filteredNodes.map((node) => {
                  const Icon = typeIcons[node.data.materialType]
                  return (
                    <div key={node.id} className={styles.nodeRow}>
                      <button className={styles.locateButton} title="定位到节点" onClick={() => locateNode(node.id)}>
                        <LocateFixed size={16} />
                      </button>
                      <Icon size={16} />
                      <div>
                        <span>{node.data.title}</span>
                        <small>{typeLabels[node.data.materialType]} · {node.data.status}</small>
                      </div>
                      <button className={styles.moreButton} title="更多操作">
                        <MoreHorizontal size={16} />
                      </button>
                    </div>
                  )
                })}

                {filteredNodes.length === 0 ? <div className={styles.emptyState}>没有匹配的节点</div> : null}
              </div>
            </>
          ) : (
            <div className={styles.assetsEmpty}>
              <Boxes size={28} />
              <p>上传图片、视频或生成结果后，会在这里沉淀为工作流资产。</p>
            </div>
          )}

          <footer className={styles.footer}>
            <button className={styles.closeButton} title="收起资产管理" onClick={() => closeWorkspacePanel('assetManager')}>
              <PanelLeftClose size={18} />
            </button>
            <span>共 {nodes.length} 节点</span>
          </footer>
        </aside>
      ) : null}
    </>
  )
}
