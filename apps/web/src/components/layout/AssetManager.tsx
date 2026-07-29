import {
  Boxes,
  ChevronDown,
  LocateFixed,
  MoreHorizontal,
  PanelLeftClose,
  Search,
} from 'lucide-react'
import { useAssetManager, type AssetManagerFilter } from './AssetManager.logic'
import { AssetManagerPrimitive as AssetUi } from './AssetManager.primitives'
import styles from './AssetManager.module.less'

export function AssetManager() {
  const manager = useAssetManager()

  return (
    <>
      <AssetUi.Entry
        title="资产管理"
        aria-expanded={manager.isOpen}
        data-active={manager.isOpen || undefined}
        onClick={(event) => {
          event.stopPropagation()
          manager.toggle()
        }}
      >
        <Boxes size={19} />
        资产管理
      </AssetUi.Entry>

      {manager.isMounted ? (
        <AssetUi.Root
          data-state={manager.presenceState}
          onPointerDown={(event) => event.stopPropagation()}
          onClick={(event) => event.stopPropagation()}
          onDoubleClick={(event) => event.stopPropagation()}
        >
          <AssetUi.Header>
            <div className={styles.brandRow}>
              <span className={styles.logoMark} />
            </div>
            <div className={styles.workspaceLine}>
              <input value={manager.workflowTitle} readOnly aria-label="项目名称" />
              <button>
                画布 1
                <ChevronDown size={14} />
              </button>
            </div>
          </AssetUi.Header>

          <AssetUi.Tabs>
            <AssetUi.Tab active={manager.tab === 'canvas'} onClick={() => manager.setTab('canvas')}>
              画布
            </AssetUi.Tab>
            <AssetUi.Tab active={manager.tab === 'assets'} onClick={() => manager.setTab('assets')}>
              资产
            </AssetUi.Tab>
          </AssetUi.Tabs>

          {manager.tab === 'canvas' ? (
            <>
              <AssetUi.Controls>
                <div className={styles.sectionTitle}>画布元素</div>
                <label className={styles.filterButton} title="筛选类型">
                  <select
                    aria-label="筛选节点类型"
                    value={manager.filter}
                    onChange={(event) => manager.setFilter(event.target.value as AssetManagerFilter)}
                  >
                    <option value="all">全部</option>
                    {manager.nodeTypes.map((nodeType) => (
                      <option key={nodeType.id} value={nodeType.materialType}>
                        {nodeType.menuLabel}
                      </option>
                    ))}
                  </select>
                </label>
                <label className={styles.searchBox}>
                  <Search size={15} />
                  <input
                    value={manager.query}
                    placeholder="搜索节点"
                    onChange={(event) => manager.setQuery(event.target.value)}
                  />
                </label>
              </AssetUi.Controls>

              <AssetUi.NodeList>
                {manager.filteredNodes.map((node) => {
                  const nodeType = manager.getNodeType(node.data.materialType)
                  const Icon = nodeType?.icon ?? Boxes
                  return (
                    <AssetUi.NodeRow key={node.id} data-material-type={node.data.materialType}>
                      <button
                        className={styles.locateButton}
                        title="定位到节点"
                        onClick={() => manager.locateNode(node.id)}
                      >
                        <LocateFixed size={16} />
                      </button>
                      <Icon size={16} />
                      <div>
                        <span>{node.data.title}</span>
                        <small>{nodeType?.menuLabel ?? node.data.materialType} · {node.data.status}</small>
                      </div>
                      <button className={styles.moreButton} title="更多操作">
                        <MoreHorizontal size={16} />
                      </button>
                    </AssetUi.NodeRow>
                  )
                })}

                {manager.filteredNodes.length === 0 ? (
                  <div className={styles.emptyState}>没有匹配的节点</div>
                ) : null}
              </AssetUi.NodeList>
            </>
          ) : (
            <div className={styles.assetsEmpty}>
              <Boxes size={28} />
              <p>上传图片、视频或生成结果后，会在这里沉淀为工作流资产。</p>
            </div>
          )}

          <AssetUi.Footer>
            <button className={styles.closeButton} title="收起资产管理" onClick={manager.close}>
              <PanelLeftClose size={18} />
            </button>
            <span>共 {manager.nodes.length} 节点</span>
          </AssetUi.Footer>
        </AssetUi.Root>
      ) : null}
    </>
  )
}
