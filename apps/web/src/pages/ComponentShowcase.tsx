import { Background, BackgroundVariant, ReactFlow, ReactFlowProvider, type Node } from '@xyflow/react'
import { ArrowLeft, FileText, Image, Play, Plus } from 'lucide-react'
import type { MaterialNodeData } from '@red-video-flow/workflow-core'
import { MaterialNode } from '../components/workflow/nodes/MaterialNode'
import { NodePromptComposer } from '../components/workflow/prompt/NodePromptComposer'
import styles from './ComponentShowcase.module.less'

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

export function ComponentShowcase() {
  return (
    <ReactFlowProvider>
      <main className={styles.page}>
        <header className={styles.header}>
          <a className={styles.backLink} href="/">
            <ArrowLeft size={18} />
            返回工作流
          </a>
          <div>
            <h1>子组件状态展示</h1>
            <p>用于集中查看文本、图片、视频节点和输入框的不同状态。</p>
          </div>
        </header>

        <section className={styles.section}>
          <div className={styles.sectionTitle}>
            <FileText size={18} />
            素材节点状态
          </div>
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
        </section>

        <section className={styles.grid}>
          <StateCard icon={<Plus size={20} />} title="添加节点菜单">
            <div className={styles.fakeMenu}>
              <span>添加节点</span>
              <button><FileText size={18} />文本</button>
              <button><Image size={18} />图片</button>
              <button><Play size={18} />视频</button>
              <span>添加资源</span>
              <button>上传</button>
            </div>
          </StateCard>

          <StateCard icon={<FileText size={20} />} title="节点下方输入框">
            <div className={styles.promptPreview}>
              <NodePromptComposer node={composerNode} />
            </div>
          </StateCard>
        </section>
      </main>
    </ReactFlowProvider>
  )
}

function StateCard({
  icon,
  title,
  children,
}: {
  icon: React.ReactNode
  title: string
  children: React.ReactNode
}) {
  return (
    <article className={styles.card}>
      <h2>
        {icon}
        {title}
      </h2>
      {children}
    </article>
  )
}
