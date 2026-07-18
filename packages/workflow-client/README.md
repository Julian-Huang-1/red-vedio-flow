# @red-video-flow/workflow-client

`workflow-client` 是浏览器侧 API client。它负责和 `apps/local-server` 暴露的 `/api/*` 接口通信，包括本地 Agent 扫描、视觉模型扫描、素材上传、文本 Agent 调用和视觉模型调用。

它只处理 HTTP、SSE 和接口返回值，不负责工作流规则、节点状态写回、React UI 或 Zustand 状态。

## 职责边界

适合放在这里：

- 调用 `/api/agents`
- 调用 `/api/visual-models`
- 上传本地素材到 `/api/upload-asset`
- 调用 `/api/run-node`
- 调用 `/api/run-visual-node`
- 解析服务端 SSE 响应
- 将接口失败转换成 `Error`

不适合放在这里：

- 判断节点能不能连接
- 决定文本节点或视觉节点应该走哪个执行策略
- 更新节点 `status` 或 `value`
- 读写 Zustand store
- 处理 React Flow 节点渲染

## 导入方式

```ts
import {
  fetchLocalAgents,
  fetchVisualModels,
  uploadAsset,
  runNodeWithAgent,
  runVisualNode,
} from '@red-video-flow/workflow-client'
```

## 类型

### `AgentListResponse`

`fetchLocalAgents()` 的返回值。

```ts
type AgentListResponse = {
  agents: LocalAgent[]
  installedCount: number
  invokableCount: number
  platform: string
}
```

示例：

```ts
const response = await fetchLocalAgents()

response.agents
response.installedCount
response.invokableCount
response.platform
```

### `VisualModel`

本地视觉模型描述。

```ts
type VisualModel = {
  id: string
  label: string
  vendor: string
  available: boolean
  invokable: boolean
  binPath?: string | null
  capabilities: string[]
}
```

示例：

```ts
const model: VisualModel = {
  id: 'dreamina',
  label: '即梦 Dreamina',
  vendor: 'ByteDance',
  available: true,
  invokable: true,
  binPath: '/usr/local/bin/dreamina',
  capabilities: ['text2image', 'image2video'],
}
```

### `VisualModelListResponse`

`fetchVisualModels()` 的返回值。

```ts
type VisualModelListResponse = {
  models: VisualModel[]
  installedCount: number
  invokableCount: number
}
```

### `RunNodePayload`

文本 Agent 调用和视觉模型调用共享的节点执行 payload。

```ts
type RunNodePayload = {
  agentId: string
  node: MaterialNode
  upstream: MaterialNode[]
  edges: WorkflowEdge[]
  prompt: string
}
```

说明：

- `node`: 当前要执行的节点
- `upstream`: 当前节点的上游节点
- `edges`: 当前工作流边
- `prompt`: 用户输入的生成指令
- `agentId`: 文本 Agent 调用时需要；视觉模型调用会省略

### `RunNodeEvents`

文本 Agent SSE 增量事件回调。

```ts
type RunNodeEvents = {
  onDelta?: (text: string) => void
}
```

示例：

```ts
await runNodeWithAgent(payload, {
  onDelta: (text) => {
    console.log('partial output:', text)
  },
})
```

### `UploadedAsset`

素材上传后的返回值。

```ts
type UploadedAsset = {
  url: string
  localPath: string
  fileName: string
}
```

示例：

```ts
const asset = await uploadAsset(file)

asset.url       // '/api/assets/uploads/xxx.png'
asset.localPath // '/Users/.../apps/local-server/.data/uploads/xxx.png'
asset.fileName  // 'xxx.png'
```

### `VisualRunResult`

视觉模型执行结果。

```ts
type VisualRunResult = {
  submitId?: string
  url?: string
  localPath?: string
  fileName?: string
  mimeType?: string
  text?: string
}
```

示例：

```ts
const result: VisualRunResult = {
  submitId: 'dreamina-123',
  url: '/api/assets/generated/output.png',
  localPath: '/Users/.../generated/output.png',
  fileName: 'output.png',
  mimeType: 'image/generated',
  text: '生成完成',
}
```

## 函数

### `fetchLocalAgents()`

扫描本机可用的本地 Agent。

请求：

```txt
GET /api/agents
```

用法：

```ts
const response = await fetchLocalAgents()
const invokableAgents = response.agents.filter((agent) => agent.invokable)
```

失败时会抛出：

```txt
本地 Agent 服务不可用
```

### `fetchVisualModels()`

扫描本机可用的视觉模型。

请求：

```txt
GET /api/visual-models
```

用法：

```ts
const response = await fetchVisualModels()
const dreamina = response.models.find((model) => model.id === 'dreamina')
```

失败时会抛出：

```txt
本地视觉模型服务不可用
```

### `uploadAsset(file)`

上传图片或视频素材到本地服务。

请求：

```txt
POST /api/upload-asset?fileName=...&mimeType=...
```

用法：

```ts
const asset = await uploadAsset(file)

const nextValue = {
  url: asset.url,
  localPath: asset.localPath,
  fileName: asset.fileName,
  mimeType: file.type,
}
```

失败时会抛出：

```txt
上传本地素材失败
```

### `runNodeWithAgent(payload, events?)`

调用文本 Agent 执行节点。

请求：

```txt
POST /api/run-node
```

发送给服务端的关键字段：

```ts
{
  agentId: payload.agentId,
  nodeKind: payload.node.data.materialType,
  prompt: payload.prompt,
  currentNode: payload.node,
  upstream: payload.upstream,
  edges: payload.edges,
}
```

用法：

```ts
const output = await runNodeWithAgent(
  {
    agentId: 'codex',
    node,
    upstream,
    edges,
    prompt: '扩写成 60 秒短剧脚本',
  },
  {
    onDelta: (text) => console.log(text),
  },
)
```

返回值：

```ts
string
```

它会解析服务端 SSE：

- `delta`: 累加文本，并触发 `events.onDelta`
- `done`: 使用最终 `output`
- `error`: 抛出错误

如果服务端返回非 2xx，会优先读取 JSON 中的 `error` 字段。

### `runVisualNode(payload)`

调用视觉模型执行图片或视频节点。

请求：

```txt
POST /api/run-visual-node
```

发送给服务端的关键字段：

```ts
{
  modelId: payload.modelId ?? 'dreamina',
  nodeKind: payload.node.data.materialType,
  prompt: payload.prompt,
  currentNode: payload.node,
  upstream: payload.upstream,
  edges: payload.edges,
}
```

用法：

```ts
const result = await runVisualNode({
  node: imageNode,
  upstream,
  edges,
  prompt: '女主站在雨夜写字楼门口，电影感，竖屏',
})
```

指定模型：

```ts
const result = await runVisualNode({
  modelId: 'dreamina',
  node: videoNode,
  upstream,
  edges,
  prompt: '镜头缓慢推进，女主抬头看向镜头',
})
```

返回值：

```ts
VisualRunResult
```

它会解析服务端 SSE：

- `done`: 返回 `event.result`
- `error`: 抛出错误

如果流结束后没有收到 `done` 结果，会抛出：

```txt
视觉模型没有返回结果
```

## 与 runtime 组合使用

`workflow-client` 不决定执行策略，通常由 `workflow-runtime` 通过 adapter 调用它。

```ts
import { runWorkflowNode } from '@red-video-flow/workflow-runtime'
import { runNodeWithAgent, runVisualNode } from '@red-video-flow/workflow-client'

const result = await runWorkflowNode(
  {
    node,
    upstream,
    edges,
    prompt,
    selectedAgent,
  },
  {
    runTextAgent: runNodeWithAgent,
    runVisualModel: runVisualNode,
  },
)
```

这样边界是：

- `workflow-runtime`: 决定怎么执行节点
- `workflow-client`: 负责实际请求本地服务
- app store: 负责把结果写回 UI 状态

