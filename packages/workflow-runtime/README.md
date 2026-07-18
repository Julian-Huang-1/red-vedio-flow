# @red-video-flow/workflow-runtime

`workflow-runtime` 是节点执行策略层。它负责根据节点素材类型决定走文本 Agent 还是视觉模型，并把执行结果标准化成 app 可以写回节点的数据。

它不直接调用 HTTP，不依赖 React、React Flow 或 Zustand。外部能力通过 adapter 注入，因此 runtime 可以独立测试，也可以接不同的 client 实现。

## 职责边界

适合放在这里：

- 判断当前节点应该走文本执行还是视觉执行
- 为文本节点调用 `runTextAgent`
- 为图片/视频节点调用 `runVisualModel`
- 在没有文本 Agent 时生成 fallback 文本
- 将 Agent 或视觉模型结果转换成统一的 `RunWorkflowNodeResult`
- 处理执行异常并返回 fallback 结果

不适合放在这里：

- 直接 `fetch('/api/...')`
- 上传文件
- 扫描本地 Agent 列表
- 写入 Zustand store
- 操作 React Flow 节点渲染
- 控制 prompt composer 或菜单开关

## 导入方式

```ts
import {
  runWorkflowNode,
  fallbackGenerate,
  type WorkflowRuntimeAdapters,
  type RunWorkflowNodeInput,
  type RunWorkflowNodeResult,
} from '@red-video-flow/workflow-runtime'
```

## 类型

### `VisualRunResult`

视觉模型返回的原始结果形状。

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
  url: '/api/assets/generated/cover.png',
  localPath: '/Users/.../generated/cover.png',
  fileName: 'cover.png',
  mimeType: 'image/generated',
  text: '生成完成',
}
```

### `RunWorkflowNodeInput`

执行一个节点所需的上下文。

```ts
type RunWorkflowNodeInput = {
  node: MaterialNode
  upstream: MaterialNode[]
  edges: WorkflowEdge[]
  prompt: string
  selectedAgent?: LocalAgent
}
```

字段说明：

- `node`: 当前要执行的节点
- `upstream`: 当前节点的上游节点
- `edges`: 当前工作流边
- `prompt`: 用户输入的生成指令
- `selectedAgent`: 当前选中的可调用文本 Agent，可选

### `WorkflowRuntimeAdapters`

runtime 调用外部能力的适配器。

```ts
type WorkflowRuntimeAdapters = {
  runTextAgent: (input: {
    agentId: string
    node: MaterialNode
    upstream: MaterialNode[]
    edges: WorkflowEdge[]
    prompt: string
  }) => Promise<string>

  runVisualModel: (input: {
    node: MaterialNode
    upstream: MaterialNode[]
    edges: WorkflowEdge[]
    prompt: string
  }) => Promise<VisualRunResult>
}
```

通常由 `workflow-client` 提供这两个 adapter：

```ts
import { runNodeWithAgent, runVisualNode } from '@red-video-flow/workflow-client'

const adapters: WorkflowRuntimeAdapters = {
  runTextAgent: runNodeWithAgent,
  runVisualModel: runVisualNode,
}
```

测试时也可以传 mock adapter：

```ts
const adapters: WorkflowRuntimeAdapters = {
  runTextAgent: async () => '生成后的脚本文本',
  runVisualModel: async () => ({
    url: '/api/assets/generated/image.png',
    fileName: 'image.png',
    mimeType: 'image/generated',
  }),
}
```

### `RunWorkflowNodeResult`

runtime 标准化后的执行结果。

```ts
type RunWorkflowNodeResult = {
  status: NodeStatus
  value: MaterialValue
  assistantMessage: string
}
```

示例：

```ts
const result: RunWorkflowNodeResult = {
  status: 'done',
  value: {
    text: '生成后的短剧脚本',
  },
  assistantMessage: '已通过 OpenAI Codex 完成生成。',
}
```

app store 通常会把这个结果写回节点：

```ts
node.data.status = result.status
node.data.value = result.value
node.data.messages.push({
  id: 'msg-assistant',
  role: 'assistant',
  text: result.assistantMessage,
  createdAt: Date.now(),
})
```

## 函数

### `fallbackGenerate(prompt, upstream)`

在没有可用文本 Agent 或执行失败时，生成本地 fallback 文本。

```ts
const text = fallbackGenerate('扩写成 60 秒短剧脚本', upstream)
```

没有上游时：

```txt
根据当前指令生成：扩写成 60 秒短剧脚本
```

有上游时，会拼入 `summarizeNode()` 生成的上游摘要：

```txt
根据当前指令生成：扩写成 60 秒短剧脚本

参考上游素材：
文本节点 01: 女主站在雨夜写字楼门口。
图片节点 01: cover.png
```

### `runWorkflowNode(input, adapters)`

执行一个工作流节点。

```ts
const result = await runWorkflowNode(input, adapters)
```

执行策略：

- `image` 或 `video` 节点：调用 `adapters.runVisualModel`
- 其他节点：如果传入 `selectedAgent`，调用 `adapters.runTextAgent`
- 文本节点没有 `selectedAgent`：使用 `fallbackGenerate`
- adapter 抛错：捕获错误，并返回 fallback 文本结果

#### 文本节点示例

```ts
const result = await runWorkflowNode(
  {
    node: textNode,
    upstream: [outlineNode],
    edges,
    prompt: '扩写成 60 秒短剧脚本',
    selectedAgent: {
      id: 'codex',
      label: 'OpenAI Codex',
      vendor: 'OpenAI',
      protocol: 'stdin',
      available: true,
      invokable: true,
      binPath: '/usr/local/bin/codex',
      fallbackModels: [{ id: 'default', label: 'Default (CLI config)' }],
    },
  },
  {
    runTextAgent: async ({ prompt }) => `生成结果：${prompt}`,
    runVisualModel: async () => {
      throw new Error('视觉模型不会在文本节点中被调用')
    },
  },
)
```

返回：

```ts
{
  status: 'done',
  value: {
    text: '生成结果：扩写成 60 秒短剧脚本',
  },
  assistantMessage: '已通过 OpenAI Codex 完成生成。',
}
```

#### 无 Agent 文本节点示例

```ts
const result = await runWorkflowNode(
  {
    node: textNode,
    upstream: [],
    edges: [],
    prompt: '写一个都市逆袭短剧开场',
  },
  adapters,
)
```

返回 fallback：

```ts
{
  status: 'done',
  value: {
    text: '根据当前指令生成：写一个都市逆袭短剧开场',
  },
  assistantMessage: '已使用本地模拟结果完成生成。',
}
```

#### 图片节点示例

```ts
const result = await runWorkflowNode(
  {
    node: imageNode,
    upstream: [textNode],
    edges,
    prompt: '女主站在雨夜写字楼门口，电影感，竖屏',
  },
  {
    runTextAgent: async () => '',
    runVisualModel: async () => ({
      submitId: 'dreamina-123',
      url: '/api/assets/generated/image.png',
      localPath: '/Users/.../generated/image.png',
      fileName: 'image.png',
      mimeType: 'image/generated',
      text: '生成完成',
    }),
  },
)
```

返回：

```ts
{
  status: 'done',
  value: {
    url: '/api/assets/generated/image.png',
    localPath: '/Users/.../generated/image.png',
    fileName: 'image.png',
    mimeType: 'image/generated',
    submitId: 'dreamina-123',
    provider: 'dreamina',
  },
  assistantMessage: '已通过即梦生成视觉素材。',
}
```

#### 视觉任务仅提交但没有 URL

如果视觉模型返回 `submitId` 或文本，但没有 `url`，runtime 会保留节点为 `running`。

```ts
const result = await runWorkflowNode(input, {
  runTextAgent: async () => '',
  runVisualModel: async () => ({
    submitId: 'dreamina-123',
    text: '已提交即梦生成任务：dreamina-123',
  }),
})
```

返回：

```ts
{
  status: 'running',
  value: {
    text: '已提交即梦生成任务：dreamina-123',
    submitId: 'dreamina-123',
    provider: 'dreamina',
  },
  assistantMessage: '已提交即梦生成任务：dreamina-123',
}
```

#### adapter 抛错

如果 `runTextAgent` 或 `runVisualModel` 抛错，runtime 会捕获错误并返回 fallback 文本。

```ts
const result = await runWorkflowNode(input, {
  runTextAgent: async () => {
    throw new Error('Agent 未登录')
  },
  runVisualModel: async () => {
    throw new Error('视觉模型未安装')
  },
})
```

返回的 `value.text` 会包含 fallback 结果和错误信息：

```txt
根据当前指令生成：...

本地 Agent 调用失败：Agent 未登录
```

## 在 app store 中使用

典型调用方式：

```ts
import { getUpstreamNodes } from '@red-video-flow/workflow-core'
import { runNodeWithAgent, runVisualNode } from '@red-video-flow/workflow-client'
import { runWorkflowNode } from '@red-video-flow/workflow-runtime'

async function runNode(nodeId: string, prompt: string) {
  const node = nodes.find((item) => item.id === nodeId)
  if (!node) return

  const upstream = getUpstreamNodes(nodes, edges, nodeId)

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

  setNodes((items) =>
    items.map((item) =>
      item.id === nodeId
        ? {
            ...item,
            data: {
              ...item.data,
              status: result.status,
              value: result.value,
              messages: [
                ...item.data.messages,
                {
                  id: `msg-${Date.now()}-assistant`,
                  role: 'assistant',
                  text: result.assistantMessage,
                  createdAt: Date.now(),
                },
              ],
            },
          }
        : item,
    ),
  )
}
```

## 与 core/client 的关系

```txt
workflow-runtime
  -> workflow-core 类型和纯函数

workflow-runtime
  不直接依赖 workflow-client
```

推荐由 app 层把 `workflow-client` 注入给 runtime：

```ts
runWorkflowNode(input, {
  runTextAgent: runNodeWithAgent,
  runVisualModel: runVisualNode,
})
```

这样 runtime 保持可测试，client 保持可替换。

