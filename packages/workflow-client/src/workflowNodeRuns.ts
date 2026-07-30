import type {
  NodeRun,
  NodeResult,
  NodeRunInput,
  NodeRunStatus,
} from '@red-video-flow/workflow-core'
import { getWorkflowClientTransport } from './transport'

export type WorkflowNodeRunEvent =
  | { type: 'run'; status: Extract<NodeRunStatus, 'queued' | 'running'>; runId: string; workflowRevision?: number; providerTask?: { providerId: string; taskId?: string; responseId?: string } }
  | { type: 'text_delta'; runId: string; delta: string }
  | { type: 'image_partial'; runId: string; index: number; base64: string }
  | { type: 'result'; runId: string; result: NodeResult }
  | { type: 'done'; runId: string; resultIds: string[]; workflowRevision?: number }
  | { type: 'error'; runId: string; code?: string; message: string; retryable: boolean; workflowRevision?: number }

export async function executeWorkflowNodeRun(
  input: {
    runId: string
    workflowId: string
    nodeId: string
    input: NodeRunInput
  },
  options: {
    signal?: AbortSignal
    onEvent?: (event: WorkflowNodeRunEvent) => void
  } = {},
) {
  const response = await getWorkflowClientTransport().request('/api/workflow-node-runs', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
    signal: options.signal,
  })
  if (!response.ok) {
    const payload = await response.json().catch(() => undefined)
    throw new Error(payload?.error ?? '节点执行请求失败')
  }
  if (!response.body) throw new Error('浏览器不支持流式节点执行')

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let terminalEvent: Extract<WorkflowNodeRunEvent, { type: 'done' | 'error' }> | undefined

  while (true) {
    const { value, done } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const frames = buffer.split('\n\n')
    buffer = frames.pop() ?? ''
    for (const frame of frames) {
      const dataLine = frame.split('\n').find((line) => line.startsWith('data:'))
      if (!dataLine) continue
      const event = JSON.parse(dataLine.slice(5).trim()) as WorkflowNodeRunEvent
      options.onEvent?.(event)
      if (event.type === 'done' || event.type === 'error') terminalEvent = event
    }
  }

  if (!terminalEvent) throw new Error('节点执行流在返回最终状态前中断')
  if (terminalEvent.type === 'error') {
    const error = new Error(terminalEvent.message)
    Object.assign(error, {
      code: terminalEvent.code,
      retryable: terminalEvent.retryable,
    })
    throw error
  }
  return terminalEvent
}

export async function fetchWorkflowNodeRuns(workflowId: string) {
  const response = await getWorkflowClientTransport().request(
    `/api/workflow-node-runs?workflowId=${encodeURIComponent(workflowId)}`,
  )
  if (!response.ok) throw new Error('节点任务列表加载失败')
  return (await response.json()) as { runs: NodeRun[] }
}

export async function fetchWorkflowNodeRun(runId: string) {
  const response = await getWorkflowClientTransport().request(
    `/api/workflow-node-runs/${encodeURIComponent(runId)}`,
  )
  if (!response.ok) throw new Error('节点任务加载失败')
  return (await response.json()) as { run: NodeRun }
}

export async function subscribeWorkflowNodeRun(
  runId: string,
  options: {
    after?: number
    signal?: AbortSignal
    onEvent?: (event: WorkflowNodeRunEvent) => void
  } = {},
) {
  const response = await getWorkflowClientTransport().request(
    `/api/workflow-node-runs/${encodeURIComponent(runId)}/events?after=${options.after ?? 0}`,
    { signal: options.signal },
  )
  if (!response.ok || !response.body) throw new Error('节点任务事件流连接失败')
  return readEventStream(response.body, options.onEvent)
}

export async function cancelWorkflowNodeRun(runId: string) {
  const response = await getWorkflowClientTransport().request(
    `/api/workflow-node-runs/${encodeURIComponent(runId)}/cancel`,
    { method: 'POST' },
  )
  if (!response.ok) throw new Error('取消节点任务失败')
  return (await response.json()) as { run: NodeRun }
}

async function readEventStream(
  body: ReadableStream<Uint8Array>,
  onEvent?: (event: WorkflowNodeRunEvent) => void,
) {
  const reader = body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  while (true) {
    const { value, done } = await reader.read()
    if (done) return
    buffer += decoder.decode(value, { stream: true })
    const frames = buffer.split('\n\n')
    buffer = frames.pop() ?? ''
    for (const frame of frames) {
      const dataLine = frame.split('\n').find((line) => line.startsWith('data:'))
      if (dataLine) onEvent?.(JSON.parse(dataLine.slice(5).trim()) as WorkflowNodeRunEvent)
    }
  }
}
