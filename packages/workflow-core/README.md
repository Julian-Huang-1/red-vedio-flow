# @red-video-flow/workflow-core

`workflow-core` 是工作流的纯领域内核。它只定义工作流数据结构、素材类型、图规则、图查询和节点结果处理，不依赖 React、React Flow、Zustand、浏览器 DOM 或 HTTP API。

## 职责边界

适合放在这里：

- 节点和边的数据结构
- 素材类型和 MIME 能力
- 节点能否连接的业务规则
- 查询一个节点的上游或下游
- 创建标准领域节点
- 将执行结果应用到节点

不适合放在这里：

- React Flow 的 `node.type`
- 菜单坐标、选中节点、编辑态等 UI 状态
- 中文展示文案、图标、按钮配置
- `<input accept>` 这样的 DOM 属性字符串
- `fetch`、SSE、Agent 或视觉模型调用

## 导入方式

```ts
import {
  createMaterialNode,
  canConnectMaterialNodes,
  getUpstreamNodes,
  applyMaterialNodeRunResult,
  type MaterialNode,
} from '@red-video-flow/workflow-core'
```

## 数据结构

### `MaterialType`

素材节点类型。

```ts
type MaterialType = 'text' | 'image' | 'video'
```

示例：

```ts
const materialType: MaterialType = 'image'
```

### `NodeStatus`

节点生命周期状态。

```ts
type NodeStatus = 'empty' | 'ready' | 'running' | 'done' | 'error'
```

含义：

- `empty`: 节点没有素材
- `ready`: 节点已有可用素材
- `running`: 节点正在生成
- `done`: 节点生成完成
- `error`: 节点异常

### `MaterialValue`

节点的素材产物。

```ts
type MaterialValue = {
  text?: string
  url?: string
  localPath?: string
  submitId?: string
  provider?: string
  fileName?: string
  mimeType?: string
  duration?: number
}
```

文本节点示例：

```ts
const value: MaterialValue = {
  text: '女主在雨夜离开公司，决定重新开始。',
}
```

图片节点示例：

```ts
const value: MaterialValue = {
  url: '/api/assets/generated/cover.png',
  localPath: '/Users/name/project/apps/local-server/.data/generated/cover.png',
  fileName: 'cover.png',
  mimeType: 'image/generated',
  submitId: 'dreamina-123',
  provider: 'dreamina',
}
```

### `MaterialMessage`

节点消息记录。

```ts
type MaterialMessage = {
  id: string
  role: 'user' | 'assistant'
  text: string
  createdAt: number
}
```

示例：

```ts
const message: MaterialMessage = {
  id: 'msg-1',
  role: 'user',
  text: '扩写成 60 秒短剧脚本',
  createdAt: Date.now(),
}
```

### `MaterialNodeData`

节点业务数据。

```ts
type MaterialNodeData = {
  materialType: MaterialType
  title: string
  status: NodeStatus
  value: MaterialValue
  messages: MaterialMessage[]
}
```

### `MaterialNode`

纯领域节点。它不包含 React Flow 的 `type: 'material'` 字段。

```ts
type MaterialNode = {
  id: string
  position: XYPosition
  width?: number
  height?: number
  data: MaterialNodeData
}
```

示例：

```ts
const node: MaterialNode = {
  id: 'text-1',
  position: { x: 100, y: 80 },
  width: 360,
  height: 220,
  data: {
    materialType: 'text',
    title: '文本节点 01',
    status: 'empty',
    value: {},
    messages: [],
  },
}
```

在 Web app 中适配 React Flow 时，可以由 app 层补上 `type`：

```ts
const flowNode = {
  ...node,
  type: 'material',
}
```

### `WorkflowEdge`

工作流边。

```ts
type WorkflowEdge = {
  id?: string
  source: string
  target: string
}
```

示例：

```ts
const edge: WorkflowEdge = {
  source: 'text-1',
  target: 'image-1',
}
```

## 素材目录

### `materialTypes`

所有支持的素材类型。

```ts
materialTypes // ['text', 'image', 'video']
```

示例：

```ts
for (const materialType of materialTypes) {
  console.log(materialType)
}
```

### `acceptedMimeTypes`

素材类型支持的 MIME 类型。它是领域能力描述，不是 DOM `accept` 字符串。

```ts
acceptedMimeTypes.image
// ['image/png', 'image/jpeg', 'image/webp']
```

Web 层使用示例：

```tsx
<input accept={acceptedMimeTypes.image?.join(',')} />
```

### `canUploadMaterial(materialType)`

判断某种素材类型是否支持上传。

```ts
canUploadMaterial('text')  // false
canUploadMaterial('image') // true
canUploadMaterial('video') // true
```

## 图规则

### `canConnect(source, target)`

只根据素材类型判断是否允许连接。

当前规则：

- `text` 可以连接到任何素材类型
- `image` 可以连接到 `image` 或 `video`
- `video` 只能连接到 `video`

示例：

```ts
canConnect('text', 'image')  // true
canConnect('image', 'video') // true
canConnect('video', 'image') // false
```

### `hasMaterialValue(node)`

判断节点是否已有素材值。只要存在 `text`、`url` 或 `fileName` 之一，就认为节点有素材。

```ts
hasMaterialValue(emptyTextNode) // false

hasMaterialValue({
  ...emptyTextNode,
  data: {
    ...emptyTextNode.data,
    value: { text: '剧情大纲' },
  },
}) // true
```

### `canConnectMaterialNodes(source, target)`

根据完整节点判断是否允许连接。

它比 `canConnect` 多两层判断：

- source 必须已有素材
- target 如果是 `empty`，允许被有素材的 source 连接

示例：

```ts
const textNode = createMaterialNode({
  id: 'text-1',
  materialType: 'text',
  position: { x: 0, y: 0 },
  title: '文本节点 01',
})

const imageNode = createMaterialNode({
  id: 'image-1',
  materialType: 'image',
  position: { x: 420, y: 0 },
  title: '图片节点 01',
})

canConnectMaterialNodes(textNode, imageNode)
// false，因为 textNode 还是 empty

const readyTextNode = {
  ...textNode,
  data: {
    ...textNode.data,
    status: 'ready',
    value: { text: '雨夜写字楼门口，女主回头看向镜头。' },
  },
}

canConnectMaterialNodes(readyTextNode, imageNode)
// true
```

## 图查询

### `getUpstreamNodes(nodes, edges, nodeId)`

查询指定节点的所有上游节点。

```ts
const upstream = getUpstreamNodes(nodes, edges, 'video-1')
```

示例：

```ts
const nodes = [textNode, imageNode, videoNode]
const edges = [
  { source: 'text-1', target: 'video-1' },
  { source: 'image-1', target: 'video-1' },
]

getUpstreamNodes(nodes, edges, 'video-1')
// [textNode, imageNode]
```

返回顺序按 `nodes` 数组顺序决定。

### `getDownstreamNodes(nodes, edges, nodeId)`

查询指定节点的所有下游节点。

```ts
const downstream = getDownstreamNodes(nodes, edges, 'text-1')
```

示例：

```ts
const nodes = [textNode, imageNode, videoNode]
const edges = [
  { source: 'text-1', target: 'image-1' },
  { source: 'text-1', target: 'video-1' },
]

getDownstreamNodes(nodes, edges, 'text-1')
// [imageNode, videoNode]
```

返回顺序按 `nodes` 数组顺序决定。

### `summarizeNode(node)`

把节点压缩成一段适合放进 prompt 上下文的摘要。

```ts
summarizeNode(textNode)
// '文本节点 01: 雨夜写字楼门口，女主回头看向镜头。'
```

规则：

- 有 `value.text` 时，输出标题和文本
- 没有文本但有 `fileName` 时，输出标题和文件名
- 都没有时，输出标题和 `空素材`

示例：

```ts
summarizeNode({
  ...imageNode,
  data: {
    ...imageNode.data,
    value: { fileName: 'cover.png' },
  },
})
// '图片节点 01: cover.png'
```

## 节点工厂

### `createMaterialNode(input)`

创建一个标准 `MaterialNode`。

```ts
const node = createMaterialNode({
  id: 'image-1',
  materialType: 'image',
  position: { x: 300, y: 120 },
  title: '图片节点 01',
  size: { width: 560, height: 280 },
})
```

返回：

```ts
{
  id: 'image-1',
  position: { x: 300, y: 120 },
  width: 560,
  height: 280,
  data: {
    materialType: 'image',
    title: '图片节点 01',
    status: 'empty',
    value: {},
    messages: [],
  },
}
```

注意：`id`、`title` 和 `size` 由调用方传入。这样 core 保持确定性，不负责随机数、中文命名或 UI 默认尺寸。

## 节点结果

### `createGeneratedValue(node, text)`

把文本结果转换成适合节点的 `MaterialValue`。

文本节点示例：

```ts
createGeneratedValue(textNode, '生成后的短剧脚本')
// { text: '生成后的短剧脚本' }
```

已有媒体 URL 的图片/视频节点示例：

```ts
createGeneratedValue(imageNodeWithUrl, '补充说明')
// 返回 imageNodeWithUrl.data.value，避免覆盖已有媒体素材
```

没有媒体 URL 的图片/视频节点示例：

```ts
createGeneratedValue(emptyImageNode, '已提交生成任务')
// { text: '已提交生成任务' }
```

### `MaterialNodeRunResult`

节点执行后的标准结果形状。

```ts
type MaterialNodeRunResult = {
  status: NodeStatus
  value: MaterialValue
}
```

示例：

```ts
const result: MaterialNodeRunResult = {
  status: 'done',
  value: {
    url: '/api/assets/generated/cover.png',
    fileName: 'cover.png',
    mimeType: 'image/generated',
  },
}
```

### `applyMaterialNodeRunResult(node, result)`

把执行结果应用到节点，返回一个新节点，不修改原节点。

```ts
const nextNode = applyMaterialNodeRunResult(imageNode, {
  status: 'done',
  value: {
    url: '/api/assets/generated/cover.png',
    fileName: 'cover.png',
    mimeType: 'image/generated',
  },
})
```

结果：

```ts
nextNode.data.status // 'done'
nextNode.data.value.url // '/api/assets/generated/cover.png'
```

## Agent 类型

`workflow-core` 也导出本地 Agent 的基础类型，供 runtime、client 和 app 共享。

### `LocalAgentModel`

```ts
type LocalAgentModel = {
  id: string
  label: string
}
```

### `LocalAgent`

```ts
type LocalAgent = {
  id: string
  label: string
  vendor: string
  protocol: string
  available: boolean
  invokable: boolean
  binPath?: string | null
  fallbackModels: LocalAgentModel[]
}
```

示例：

```ts
const agent: LocalAgent = {
  id: 'codex',
  label: 'OpenAI Codex',
  vendor: 'OpenAI',
  protocol: 'stdin',
  available: true,
  invokable: true,
  binPath: '/usr/local/bin/codex',
  fallbackModels: [{ id: 'default', label: 'Default (CLI config)' }],
}
```

### `AgentStatus`

```ts
type AgentStatus = 'idle' | 'loading' | 'ready' | 'error'
```

用于 app 层描述 Agent 扫描/加载状态。

## 完整示例

```ts
import {
  applyMaterialNodeRunResult,
  canConnectMaterialNodes,
  createMaterialNode,
  getUpstreamNodes,
  type MaterialNode,
  type WorkflowEdge,
} from '@red-video-flow/workflow-core'

const textNode = createMaterialNode({
  id: 'text-1',
  materialType: 'text',
  position: { x: 0, y: 0 },
  title: '文本节点 01',
  size: { width: 360, height: 220 },
})

const readyTextNode: MaterialNode = {
  ...textNode,
  data: {
    ...textNode.data,
    status: 'ready',
    value: { text: '女主站在雨夜写字楼门口。' },
  },
}

const imageNode = createMaterialNode({
  id: 'image-1',
  materialType: 'image',
  position: { x: 420, y: 0 },
  title: '图片节点 01',
  size: { width: 560, height: 280 },
})

canConnectMaterialNodes(readyTextNode, imageNode)
// true

const nodes = [readyTextNode, imageNode]
const edges: WorkflowEdge[] = [{ source: 'text-1', target: 'image-1' }]

getUpstreamNodes(nodes, edges, 'image-1')
// [readyTextNode]

const doneImageNode = applyMaterialNodeRunResult(imageNode, {
  status: 'done',
  value: {
    url: '/api/assets/generated/image-1.png',
    fileName: 'image-1.png',
    mimeType: 'image/generated',
    provider: 'dreamina',
  },
})
```

