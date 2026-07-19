import type { LocalAgent, MaterialNode, WorkflowEdge } from '@red-video-flow/workflow-core'
import { getWorkflowClientTransport, readJsonResponse } from './transport'

export type AgentListResponse = {
  agents: LocalAgent[]
  installedCount: number
  invokableCount: number
  platform: string
}

export type VisualModel = {
  id: string
  label: string
  vendor: string
  available: boolean
  invokable: boolean
  binPath?: string | null
  capabilities: string[]
}

export type VisualModelListResponse = {
  models: VisualModel[]
  installedCount: number
  invokableCount: number
}

export type RunNodePayload = {
  agentId: string
  node: MaterialNode
  upstream: MaterialNode[]
  referencedNodes?: MaterialNode[]
  edges: WorkflowEdge[]
  prompt: string
  messages?: Array<{ role: 'user' | 'assistant'; text: string }>
  mode?: 'node' | 'chat'
  workflowId?: string
  workflowRevision?: number
  baseUrl?: string
}

export type RunNodeEvents = {
  onDelta?: (text: string) => void
}

export type UploadedAsset = {
  url: string
  localPath: string
  fileName: string
}

export type VisualRunResult = {
  submitId?: string
  taskStatus?: VisualTaskStatus
  genStatus?: string
  failReason?: string
  url?: string
  localPath?: string
  fileName?: string
  mimeType?: string
  text?: string
}

export type VisualTaskStatus = 'querying' | 'success' | 'failed' | 'unknown'

export async function fetchLocalAgents() {
  const response = await getWorkflowClientTransport().request('/api/agents')
  return readJsonResponse<AgentListResponse>(response, '本地 Agent 服务不可用')
}

export async function fetchVisualModels() {
  const response = await getWorkflowClientTransport().request('/api/visual-models')
  return readJsonResponse<VisualModelListResponse>(response, '本地视觉模型服务不可用')
}

export async function uploadAsset(file: File) {
  const response = await getWorkflowClientTransport().request(
    `/api/upload-asset?fileName=${encodeURIComponent(file.name)}&mimeType=${encodeURIComponent(file.type)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': file.type || 'application/octet-stream' },
      body: file,
    },
  )

  if (!response.ok) throw new Error('上传本地素材失败')
  return (await response.json()) as UploadedAsset
}

export async function runVisualNode(payload: Omit<RunNodePayload, 'agentId'> & { modelId?: string }) {
  const response = await getWorkflowClientTransport().request('/api/run-visual-node', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      modelId: payload.modelId ?? 'dreamina',
      nodeKind: payload.node.data.materialType,
      prompt: payload.prompt,
      messages: payload.messages,
      currentNode: payload.node,
      upstream: payload.upstream,
      referencedNodes: payload.referencedNodes,
      edges: payload.edges,
    }),
  })

  if (!response.ok) {
    const error = await response.json().catch(() => undefined)
    throw new Error(error?.error ?? '视觉模型调用失败')
  }

  if (!response.body) throw new Error('浏览器不支持流式读取视觉模型输出')

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let result: VisualRunResult | undefined

  while (true) {
    const { value, done } = await reader.read()
    if (done) break

    buffer += decoder.decode(value, { stream: true })
    const parts = buffer.split('\n\n')
    buffer = parts.pop() ?? ''

    for (const part of parts) {
      const dataLine = part
        .split('\n')
        .find((line) => line.startsWith('data: '))

      if (!dataLine) continue

      const event = JSON.parse(dataLine.slice(6)) as { type?: string; result?: VisualRunResult; message?: string }

      if (event.type === 'done') result = event.result
      if (event.type === 'error') throw new Error(event.message ?? '视觉模型调用失败')
    }
  }

  if (!result) throw new Error('视觉模型没有返回结果')
  return result
}

export async function queryVisualTask(input: {
  submitId: string
  nodeKind?: MaterialNode['data']['materialType']
}) {
  const response = await getWorkflowClientTransport().request('/api/query-visual-task', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
  return readJsonResponse<VisualRunResult>(response, '查询视觉任务失败')
}

export async function runNodeWithAgent(payload: RunNodePayload, events: RunNodeEvents = {}) {
  const response = await getWorkflowClientTransport().request('/api/run-node', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      agentId: payload.agentId,
      workflowId: payload.workflowId,
      workflowRevision: payload.workflowRevision,
      baseUrl: payload.baseUrl ?? getBrowserOrigin(),
      mode: payload.mode,
      nodeKind: payload.node.data.materialType,
      prompt: payload.prompt,
      currentNode: payload.node,
      upstream: payload.upstream,
      edges: payload.edges,
    }),
  })

  if (!response.ok) {
    const error = await response.json().catch(() => undefined)
    throw new Error(error?.error ?? '本地 Agent 调用失败')
  }

  if (!response.body) throw new Error('浏览器不支持流式读取 Agent 输出')

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let output = ''

  while (true) {
    const { value, done } = await reader.read()
    if (done) break

    buffer += decoder.decode(value, { stream: true })
    const parts = buffer.split('\n\n')
    buffer = parts.pop() ?? ''

    for (const part of parts) {
      const dataLine = part
        .split('\n')
        .find((line) => line.startsWith('data: '))

      if (!dataLine) continue

      const event = JSON.parse(dataLine.slice(6)) as {
        type?: string
        text?: string
        output?: string
        message?: string
        code?: number
      }

      if (event.type === 'delta' && event.text) {
        output += event.text
        events.onDelta?.(event.text)
      }

      if (event.type === 'done' && event.output) output = event.output
      if (event.type === 'done' && event.code !== undefined && event.code !== 0 && !output.trim()) {
        throw new Error(`Agent 退出码 ${event.code}`)
      }
      if (event.type === 'error') throw new Error(event.message ?? '本地 Agent 调用失败')
    }
  }

  return output.trim()
}

function getBrowserOrigin() {
  if (typeof globalThis.location === 'undefined') return undefined
  return globalThis.location.origin
}
