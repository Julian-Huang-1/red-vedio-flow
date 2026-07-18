import { Boxes, ImagePlus, Sparkles } from 'lucide-react'
import { useWorkflowStore, type CanvasPanel } from '../../store/workflowStore'
import styles from './CanvasToolRail.module.less'

const presets = [
  { title: '左弧滑行', desc: '镜头沿主体左侧弧线推进，适合人物或产品开场。' },
  { title: '360 旋转展示', desc: '围绕物体一周，突出商品结构和材质。' },
  { title: '瞳孔拉近', desc: '从中景快速推至眼部细节，强化情绪转折。' },
  { title: '粒子融解', desc: '主体边缘逐步化成粒子，适合梦境和转场。' },
  { title: '大师分镜九宫格', desc: '生成九格关键画面，快速搭建故事板。' },
]

const assetSections = [
  { title: '风格库', desc: '沉淀常用画面风格，后续可生成风格节点。', icon: ImagePlus },
  { title: '特效库', desc: '整理转场、运镜、视觉特效模板。', icon: Sparkles },
]

const shortcutRows = [
  ['添加节点', '双击画布 / +'],
  ['整理画布', 'Option + Shift + F'],
  ['删除节点', 'Delete'],
  ['取消选择', 'Esc'],
]

export function CanvasToolRail() {
  const activePanel = useWorkflowStore((state) => state.activeCanvasPanel)
  const closeCanvasPanel = useWorkflowStore((state) => state.closeCanvasPanel)

  return (
    activePanel ? (
        <aside
          className={styles.panel}
          onPointerDown={(event) => event.stopPropagation()}
          onClick={(event) => event.stopPropagation()}
          onDoubleClick={(event) => event.stopPropagation()}
        >
          <div className={styles.panelHeader}>
            <h2>{panelTitle[activePanel]}</h2>
            <button title="关闭" onClick={closeCanvasPanel}>×</button>
          </div>
          <PanelContent panel={activePanel} />
        </aside>
    ) : null
  )
}

const panelTitle: Record<CanvasPanel, string> = {
  toolbox: '工具箱',
  assets: '素材库',
  characters: '角色库',
  history: '历史记录',
  shortcuts: '快捷键',
}

function PanelContent({ panel }: { panel: CanvasPanel }) {
  if (panel === 'toolbox') {
    return (
      <div className={styles.templateGrid}>
        {presets.map((preset) => (
          <button key={preset.title} className={styles.templateCard}>
            <span>{preset.title}</span>
            <small>{preset.desc}</small>
          </button>
        ))}
      </div>
    )
  }

  if (panel === 'assets') {
    return (
      <div className={styles.templateGrid}>
        {assetSections.map((section) => {
          const Icon = section.icon
          return (
            <button key={section.title} className={styles.assetCard}>
              <Icon size={19} />
              <span>{section.title}</span>
              <small>{section.desc}</small>
            </button>
          )
        })}
      </div>
    )
  }

  if (panel === 'shortcuts') {
    return (
      <div className={styles.shortcutList}>
        {shortcutRows.map(([label, shortcut]) => (
          <div key={label} className={styles.shortcutRow}>
            <span>{label}</span>
            <kbd>{shortcut}</kbd>
          </div>
        ))}
      </div>
    )
  }

  return (
    <div className={styles.emptyPanel}>
      <Boxes size={28} />
      <p>{panel === 'characters' ? '角色资产会在这里集中管理。' : '生成历史会在这里集中管理。'}</p>
    </div>
  )
}
