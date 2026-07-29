import type { MaterialNodeData } from '@red-video-flow/workflow-core'
import { Background, BackgroundVariant, ReactFlow, type Node } from '@xyflow/react'
import { MaterialNode } from '../../../components/workflow/nodes/MaterialNode'
import { NodePromptComposer } from '../../../components/workflow/prompt/NodePromptComposer'
import styles from '../ComponentShowcase.module.less'
import type { ShowcaseItem } from './types'

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

export const materialNodeShowcases: ShowcaseItem[] = [
  {
    id: 'workflow-material-node',
    title: 'MaterialNode',
    category: 'workflow',
    description: '文本、图片、视频素材节点在空态、就绪态和完成态下的集中预览。',
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
    preview: () => (
      <div className={styles.promptPreview}>
        <NodePromptComposer node={composerNode} />
      </div>
    ),
  },
]
