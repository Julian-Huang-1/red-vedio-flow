import { Background, BackgroundVariant, ReactFlow, type Node } from '@xyflow/react'
import { FileText, Image, Play, Plus } from 'lucide-react'
import type { MaterialNodeData } from '@red-video-flow/workflow-core'
import { MaterialNode } from '../../components/workflow/nodes/MaterialNode'
import { NodePromptComposer } from '../../components/workflow/prompt/NodePromptComposer'
import { InspirationBox } from '../home/components/InspirationBox'
import { RecentWorkflowRail } from '../home/components/RecentWorkflowRail'
import { SkillChips } from '../home/components/SkillChips'
import { StartActions } from '../home/components/StartActions'
import { StartHeader } from '../home/components/StartHeader'
import styles from './ComponentShowcase.module.less'

export type ShowcaseItem = {
  id: string
  title: string
  category: string
  description: string
  code: string
  prompt: string
  preview: () => JSX.Element
}

const nodeTypes = {
  material: MaterialNode,
}

const svgImage = encodeURIComponent(`
<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360" viewBox="0 0 640 360">
  <defs>
    <linearGradient id="g" x1="0" x2="1" y1="0" y2="1">
      <stop offset="0" stop-color="#16202c"/>
      <stop offset="0.55" stop-color="#402a32"/>
      <stop offset="1" stop-color="#151515"/>
    </linearGradient>
  </defs>
  <rect width="640" height="360" fill="url(#g)"/>
  <circle cx="435" cy="135" r="46" fill="#e8d8c9" opacity=".86"/>
  <rect x="390" y="184" width="110" height="126" rx="52" fill="#1b1b1b"/>
  <rect x="80" y="250" width="480" height="18" rx="9" fill="#ffffff" opacity=".12"/>
  <text x="58" y="70" fill="#ffffff" opacity=".74" font-size="28" font-family="Arial">Uploaded image material</text>
</svg>`)

const showcaseNodes: Node<MaterialNodeData, 'material'>[] = [
  {
    id: 'text-empty',
    type: 'material',
    position: { x: 30, y: 80 },
    width: 360,
    height: 220,
    data: {
      materialType: 'text',
      title: '文本节点 空态',
      status: 'empty',
      value: {},
      messages: [],
    },
  },
  {
    id: 'text-ready',
    type: 'material',
    position: { x: 450, y: 80 },
    width: 360,
    height: 220,
    data: {
      materialType: 'text',
      title: '文本节点 可编辑',
      status: 'ready',
      value: { text: '女主被裁员后，在雨夜写字楼门口接到神秘电话，决定反击。' },
      messages: [],
    },
  },
  {
    id: 'image-empty',
    type: 'material',
    position: { x: 30, y: 390 },
    width: 560,
    height: 280,
    data: {
      materialType: 'image',
      title: '图片节点 空态',
      status: 'empty',
      value: {},
      messages: [],
    },
  },
  {
    id: 'image-ready',
    type: 'material',
    position: { x: 650, y: 390 },
    width: 560,
    height: 280,
    data: {
      materialType: 'image',
      title: '图片节点 已上传',
      status: 'ready',
      value: {
        url: `data:image/svg+xml;charset=utf-8,${svgImage}`,
        fileName: 'hero-frame.webp',
        mimeType: 'image/webp',
      },
      messages: [],
    },
  },
  {
    id: 'video-empty',
    type: 'material',
    position: { x: 30, y: 780 },
    width: 560,
    height: 280,
    data: {
      materialType: 'video',
      title: '视频节点 空态',
      status: 'empty',
      value: {},
      messages: [],
    },
  },
  {
    id: 'video-generated',
    type: 'material',
    position: { x: 650, y: 780 },
    width: 560,
    height: 280,
    data: {
      materialType: 'video',
      title: '视频节点 已生成',
      status: 'done',
      value: { text: '根据上游首帧图生成 6 秒推进镜头。上传真实视频后这里会切换为播放器。' },
      messages: [],
    },
  },
]

const composerNode = showcaseNodes[1]

export const showcaseItems: ShowcaseItem[] = [
  {
    id: 'workflow-material-node',
    title: 'MaterialNode',
    category: 'workflow',
    description: '文本、图片、视频素材节点在空态、就绪态和完成态下的集中预览。',
    code: `import { ReactFlow } from '@xyflow/react'
import { MaterialNode } from '@/components/workflow/nodes/MaterialNode'

const nodeTypes = { material: MaterialNode }

export function MaterialNodePreview() {
  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      nodeTypes={nodeTypes}
      nodesDraggable={false}
      nodesConnectable={false}
      elementsSelectable={false}
      fitView
    />
  )
}`,
    prompt: `为 red-video-flow 设计一个 MaterialNode 组件展示状态矩阵。要求支持 text/image/video 三种 materialType，状态通过 data 或 props 驱动，保持 React Flow 节点可嵌入，预览中展示空态、ready、done 和 media preview。`,
    preview: () => (
      <div className={styles.canvasPreview}>
        <ReactFlow
          nodes={showcaseNodes}
          edges={[
            { id: 'e1', source: 'text-ready', target: 'image-empty', animated: true },
            { id: 'e2', source: 'image-ready', target: 'video-empty', animated: true },
          ]}
          nodeTypes={nodeTypes}
          nodesDraggable={false}
          nodesConnectable={false}
          elementsSelectable={false}
          panOnDrag
          zoomOnScroll
          fitView
          proOptions={{ hideAttribution: true }}
        >
          <Background variant={BackgroundVariant.Dots} gap={22} size={1.4} color="#303030" />
        </ReactFlow>
      </div>
    ),
  },
  {
    id: 'node-prompt-composer',
    title: 'NodePromptComposer',
    category: 'workflow',
    description: '节点下方的生成指令输入框，支持选择 Agent、视觉模型提示和回车提交。',
    code: `import { NodePromptComposer } from '@/components/workflow/prompt/NodePromptComposer'

export function PromptComposerPreview({ node }) {
  return <NodePromptComposer node={node} />
}`,
    prompt: `实现一个节点级 Prompt Composer，作为 React Flow 节点附近的浮层。要求支持 text/image/video 的 placeholder，显示上游输入素材摘要，支持 Agent 下拉选择、Enter 提交、关闭按钮，并阻止事件冒泡影响画布拖拽。`,
    preview: () => (
      <div className={styles.promptPreview}>
        <NodePromptComposer node={composerNode} />
      </div>
    ),
  },
  {
    id: 'add-node-menu',
    title: 'AddNodeMenu',
    category: 'workflow',
    description: '右键或双击画布时使用的节点创建菜单。',
    code: `export function AddNodeMenu() {
  return (
    <div role="menu">
      <button>文本</button>
      <button>图片</button>
      <button>视频</button>
    </div>
  )
}`,
    prompt: `封装一个画布 AddNodeMenu。要求可作为浮层定位在鼠标点击位置，菜单项包含文本、图片、视频和上传入口，点击后调用 createNode(materialType)，样式使用 data-* 暴露 active/disabled 状态。`,
    preview: () => (
      <div className={styles.fakeMenu}>
        <span>添加节点</span>
        <button><FileText size={18} />文本</button>
        <button><Image size={18} />图片</button>
        <button><Play size={18} />视频</button>
        <span>添加资源</span>
        <button><Plus size={18} />上传</button>
      </div>
    ),
  },
  {
    id: 'home-header',
    title: 'StartHeader',
    category: 'home',
    description: '首页顶部品牌与操作入口，使用组合式 primitive 和 data-variant 样式。',
    code: `import { StartHeader } from '@/pages/home/components/StartHeader'

export function HomeHeaderPreview() {
  return <StartHeader />
}`,
    prompt: `用 Radix composition 风格封装 StartHeader。要求拆成 Root、Brand、LogoMark、Nav、Action primitives，业务组件组合这些 primitives，按钮视觉变体通过 data-variant="challenge|market|member" 控制。`,
    preview: () => (
      <div className={styles.homePreview}>
        <StartHeader />
      </div>
    ),
  },
  {
    id: 'recent-workflow-rail',
    title: 'RecentWorkflowRail',
    category: 'home',
    description: '首页历史画布卡片轨道，支持占位和真实工作流两种状态。',
    code: `import { RecentWorkflowRail } from '@/pages/home/components/RecentWorkflowRail'

export function RecentRailPreview({ workflows }) {
  return <RecentWorkflowRail workflows={workflows} onOpenCanvas={console.log} />
}`,
    prompt: `实现一个 RecentWorkflowRail 首页组件。要求支持 workflows 为空时显示 placeholder cards，有数据时显示最近 3 个工作流；卡片 tone 用 data-tone="orange|blue|mono"，占位态用 data-placeholder，分页点用 data-active。`,
    preview: () => (
      <div className={styles.homePreview}>
        <RecentWorkflowRail workflows={[]} onOpenCanvas={() => undefined} />
      </div>
    ),
  },
  {
    id: 'home-start-actions',
    title: 'StartActions',
    category: 'home',
    description: '首页开始创作和快速体验操作区。',
    code: `import { StartActions } from '@/pages/home/components/StartActions'

export function StartActionsPreview() {
  return <StartActions disabled={false} isCreating={false} onCreate={() => undefined} />
}`,
    prompt: `封装 StartActions 组件。要求无头 primitive 暴露 Root 和 Button，按钮通过 data-variant="primary|secondary" 区分样式，通过 data-disabled 控制禁用态，不在 CSS 中依赖变体 class。`,
    preview: () => <StartActions disabled={false} isCreating={false} onCreate={() => undefined} />,
  },
  {
    id: 'inspiration-box',
    title: 'InspirationBox',
    category: 'home',
    description: '首页灵感输入框和工具按钮组。',
    code: `import { InspirationBox } from '@/pages/home/components/InspirationBox'

export function InspirationBoxPreview() {
  return <InspirationBox onSubmit={() => undefined} />
}`,
    prompt: `实现 InspirationBox。要求使用 Root、Footer、Tools、IconButton、Submit primitives 组合；textarea 提供创作灵感输入；工具按钮使用 lucide 图标；提交按钮通过 data-variant="submit" 定制样式。`,
    preview: () => <InspirationBox onSubmit={() => undefined} />,
  },
  {
    id: 'skill-chips',
    title: 'SkillChips',
    category: 'home',
    description: '首页 Skill 快捷入口列表。',
    code: `import { SkillChips } from '@/pages/home/components/SkillChips'

export function SkillChipsPreview() {
  return <SkillChips onSelect={() => undefined} />
}`,
    prompt: `实现 SkillChips。要求 Root、Chip、Thumb 三个 primitives 组合，展示一组中文短视频创作 skill，点击任意 chip 调用 onSelect，布局支持自动换行和移动端宽度约束。`,
    preview: () => <SkillChips onSelect={() => undefined} />,
  },
]
