import {
  createWorkflowContract,
  type MaterialNode,
  type MaterialValue,
  type WorkflowDocument,
  type WorkflowEdge,
} from '@red-video-flow/workflow-core'
import type { VisualCapability } from '@red-video-flow/plugin-contract'
import type { LocalServerRuntime } from '../runtime.js'
import { readJson, resourcePath, sendJson, type RequestContext } from '../http.js'

type AppRunStatus = 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled'

type AppRunEvent = {
  id: number
  type: 'started' | 'node_started' | 'node_completed' | 'completed' | 'failed' | 'cancelled'
  nodeId?: string
  message?: string
  createdAt: number
}

type AppRun = {
  id: string
  workflowId: string
  revision: number
  status: AppRunStatus
  inputs: Record<string, unknown>
  outputs?: Record<string, MaterialValue>
  error?: string
  events: AppRunEvent[]
  createdAt: number
  updatedAt: number
  cancelled: boolean
}

const runs = new Map<string, AppRun>()

export async function handleWorkflowAppRoutes(runtime: LocalServerRuntime, ctx: RequestContext) {
  const { req, res, pathname } = ctx

  if (req.method === 'GET' && /^\/api\/workflows\/[^/]+\/contract$/.test(pathname)) {
    const workflowId = resourcePath(pathname, '/api/workflows/')?.[0]
    const workflow = requireWorkflow(runtime, workflowId)
    sendJson(res, 200, { contract: createWorkflowContract(workflow) })
    return true
  }

  if (req.method === 'POST' && /^\/api\/workflows\/[^/]+\/runs$/.test(pathname)) {
    const workflowId = resourcePath(pathname, '/api/workflows/')?.[0]
    const workflow = requireWorkflow(runtime, workflowId)
    const body = await readJson(req)
    const inputs = isRecord(body.inputs) ? body.inputs : {}
    const run = createRun(workflow, inputs)
    runs.set(run.id, run)
    void executeRun(runtime, workflow, run)
    sendJson(res, 202, { run: publicRun(run) })
    return true
  }

  if (req.method === 'GET' && pathname.startsWith('/api/workflow-runs/')) {
    const runId = resourcePath(pathname, '/api/workflow-runs/')?.[0]
    if (!runId) return false
    const run = runs.get(runId)
    if (!run) {
      sendJson(res, 404, { error: `workflow run not found: ${runId}` })
      return true
    }
    sendJson(res, 200, { run: publicRun(run) })
    return true
  }

  if (
    (req.method === 'POST' && /^\/api\/workflow-runs\/[^/]+\/cancel$/.test(pathname))
    || (req.method === 'DELETE' && pathname.startsWith('/api/workflow-runs/'))
  ) {
    const runId = req.method === 'POST'
      ? resourcePath(pathname, '/api/workflow-runs/')?.[0]
      : resourcePath(pathname, '/api/workflow-runs/')?.[0]
    if (!runId) return false
    const run = runs.get(runId)
    if (!run) {
      sendJson(res, 404, { error: `workflow run not found: ${runId}` })
      return true
    }
    run.cancelled = true
    if (run.status === 'queued' || run.status === 'running') {
      run.status = 'cancelled'
      addEvent(run, 'cancelled', undefined, '运行已取消')
    }
    sendJson(res, 200, { run: publicRun(run) })
    return true
  }

  return false
}

async function executeRun(
  runtime: LocalServerRuntime,
  workflow: WorkflowDocument,
  run: AppRun,
) {
  try {
    const contract = createWorkflowContract(workflow)
    const values = new Map(workflow.graph.nodes.map((node) => [node.id, { ...node.data.value }]))
    for (const field of Object.values(contract.inputs)) {
      if (!(field.label in run.inputs)) throw new Error(`missing required input: ${field.label}`)
      values.set(field.nodeId, inputValue(field.type, run.inputs[field.label]))
    }

    run.status = 'running'
    addEvent(run, 'started', undefined, 'Workflow 开始运行')
    const orderedNodes = topologicalNodes(workflow.graph.nodes, workflow.graph.edges)
    const reachable = relevantNodeIds(workflow, contract)

    for (const node of orderedNodes) {
      if (run.cancelled) throw new CancelledError()
      if (!reachable.has(node.id) || node.data.serviceRole === 'input') continue
      const upstream = upstreamNodes(node, workflow.graph.nodes, workflow.graph.edges, values)
      addEvent(run, 'node_started', node.id, `开始执行 ${node.data.title}`)
      const value = node.data.materialType === 'text'
        ? executeTextNode(node, upstream, values.get(node.id))
        : await executeVisualNode(runtime, run, node, upstream)
      values.set(node.id, value)
      addEvent(run, 'node_completed', node.id, `完成 ${node.data.title}`)
    }

    run.outputs = Object.fromEntries(
      Object.values(contract.outputs).map((field) => {
        const value = values.get(field.nodeId)
        if (!value || !hasValue(value)) throw new Error(`output has no value: ${field.label}`)
        return [field.label, value]
      }),
    )
    run.status = 'succeeded'
    addEvent(run, 'completed', undefined, 'Workflow 运行完成')
  } catch (error) {
    if (error instanceof CancelledError || run.cancelled) {
      run.status = 'cancelled'
      if (!run.events.some((event) => event.type === 'cancelled')) {
        addEvent(run, 'cancelled', undefined, '运行已取消')
      }
    } else {
      run.status = 'failed'
      run.error = error instanceof Error ? error.message : String(error)
      addEvent(run, 'failed', undefined, run.error)
    }
  }
}

function executeTextNode(
  node: MaterialNode,
  upstream: MaterialNode[],
  current: MaterialValue | undefined,
) {
  if (current?.text?.trim()) return current
  const text = upstream
    .map((item) => item.data.value.text || item.data.value.url || item.data.value.fileName)
    .filter(Boolean)
    .join('\n')
  return { text: text || node.data.title }
}

async function executeVisualNode(
  runtime: LocalServerRuntime,
  run: AppRun,
  node: MaterialNode,
  upstream: MaterialNode[],
) {
  const capability = visualCapability(node, upstream)
  const providerId = selectProvider(runtime, node, capability)
  const executionId = `${run.id}-${node.id}`
  const downloadDir = `${runtime.backend.assets.generatedDir}/${executionId}`
  let result = await runtime.backend.visual.invoke({
    executionId,
    idempotencyKey: executionId,
    modelId: providerId,
    nodeKind: node.data.materialType,
    prompt: nodePrompt(node, upstream),
    upstream,
    providerOptions: node.data.visualProviderOptions,
    downloadDir,
    assetUrlForPath: (filePath) => runtime.backend.assets.assetUrlForPath(filePath),
  })
  while (result.taskStatus === 'querying' && result.submitId) {
    if (run.cancelled) throw new CancelledError()
    await delay(2_000)
    result = await runtime.backend.visual.query({
      executionId: `${executionId}-query`,
      providerId,
      submitId: result.submitId,
      nodeKind: node.data.materialType,
      downloadDir,
      assetUrlForPath: (filePath) => runtime.backend.assets.assetUrlForPath(filePath),
    })
  }
  if (result.taskStatus === 'failed') throw new Error(result.failReason || `${node.data.title} 生成失败`)
  if (!result.url && !result.localPath) throw new Error(`${node.data.title} 未返回素材`)
  return {
    url: result.url,
    localPath: result.localPath,
    fileName: result.fileName,
    mimeType: result.mimeType,
    text: result.text,
    provider: providerId,
    submitId: result.submitId,
  }
}

function selectProvider(
  runtime: LocalServerRuntime,
  node: MaterialNode,
  capability: VisualCapability,
) {
  const preferred = node.data.visualProviderId || node.data.value.provider
  if (preferred) {
    const registered = runtime.plugins.contributions.getVisualProvider(preferred)
    if (registered?.contribution.capabilities.includes(capability)) return preferred
    throw new Error(`${node.data.title} configured visual provider is unavailable or does not support ${capability}: ${preferred}`)
  }
  throw new Error(`${node.data.title} has no configured visual provider`)
}

function visualCapability(node: MaterialNode, upstream: MaterialNode[]): VisualCapability {
  const hasImage = upstream.some(
    (item) => item.data.materialType === 'image' && hasValue(item.data.value),
  )
  if (node.data.materialType === 'image') return hasImage ? 'image-to-image' : 'text-to-image'
  return hasImage ? 'image-to-video' : 'text-to-video'
}

function nodePrompt(node: MaterialNode, upstream: MaterialNode[]) {
  return [...node.data.messages].reverse().find((message) => message.role === 'user')?.text
    || upstream
      .map((item) => item.data.value.text?.trim())
      .filter(Boolean)
      .join('\n')
    || node.data.value.text
    || node.data.title
}

function upstreamNodes(
  node: MaterialNode,
  nodes: MaterialNode[],
  edges: WorkflowEdge[],
  values: Map<string, MaterialValue>,
) {
  const upstreamIds = edges.filter((edge) => edge.target === node.id).map((edge) => edge.source)
  return nodes
    .filter((item) => upstreamIds.includes(item.id))
    .map((item) => ({
      ...item,
      data: { ...item.data, value: values.get(item.id) ?? item.data.value },
    }))
}

function inputValue(type: MaterialNode['data']['materialType'], input: unknown): MaterialValue {
  if (type === 'text') {
    if (typeof input !== 'string') throw new Error('text input must be a string')
    return { text: input }
  }
  if (!isRecord(input)) throw new Error(`${type} input must be an uploaded asset`)
  const value = {
    url: typeof input.url === 'string' ? input.url : undefined,
    localPath: typeof input.localPath === 'string' ? input.localPath : undefined,
    fileName: typeof input.fileName === 'string' ? input.fileName : undefined,
    mimeType: typeof input.mimeType === 'string' ? input.mimeType : undefined,
  }
  if (!value.url && !value.localPath) throw new Error(`${type} input has no url or localPath`)
  return value
}

function relevantNodeIds(
  workflow: WorkflowDocument,
  contract: ReturnType<typeof createWorkflowContract>,
) {
  const fromInputs = new Set(Object.values(contract.inputs).map((field) => field.nodeId))
  let changed = true
  while (changed) {
    changed = false
    for (const edge of workflow.graph.edges) {
      if (fromInputs.has(edge.source) && !fromInputs.has(edge.target)) {
        fromInputs.add(edge.target)
        changed = true
      }
    }
  }
  const toOutputs = new Set(Object.values(contract.outputs).map((field) => field.nodeId))
  changed = true
  while (changed) {
    changed = false
    for (const edge of workflow.graph.edges) {
      if (toOutputs.has(edge.target) && !toOutputs.has(edge.source)) {
        toOutputs.add(edge.source)
        changed = true
      }
    }
  }
  return new Set([...fromInputs].filter((id) => toOutputs.has(id)))
}

function topologicalNodes(nodes: MaterialNode[], edges: WorkflowEdge[]) {
  const indegree = new Map(nodes.map((node) => [node.id, 0]))
  const downstream = new Map(nodes.map((node) => [node.id, [] as string[]]))
  for (const edge of edges) {
    indegree.set(edge.target, (indegree.get(edge.target) ?? 0) + 1)
    downstream.get(edge.source)?.push(edge.target)
  }
  const queue = nodes.filter((node) => indegree.get(node.id) === 0)
  const result: MaterialNode[] = []
  while (queue.length) {
    const node = queue.shift()!
    result.push(node)
    for (const target of downstream.get(node.id) ?? []) {
      const next = (indegree.get(target) ?? 0) - 1
      indegree.set(target, next)
      if (next === 0) queue.push(nodes.find((item) => item.id === target)!)
    }
  }
  if (result.length !== nodes.length) throw new Error('workflow contains a cycle')
  return result
}

function createRun(workflow: WorkflowDocument, inputs: Record<string, unknown>): AppRun {
  const now = Date.now()
  return {
    id: `app-run-${now}-${Math.round(Math.random() * 1_000_000)}`,
    workflowId: workflow.id,
    revision: workflow.revision,
    status: 'queued',
    inputs,
    events: [],
    createdAt: now,
    updatedAt: now,
    cancelled: false,
  }
}

function addEvent(
  run: AppRun,
  type: AppRunEvent['type'],
  nodeId?: string,
  message?: string,
) {
  const now = Date.now()
  run.events.push({ id: run.events.length + 1, type, nodeId, message, createdAt: now })
  run.updatedAt = now
}

function publicRun(run: AppRun) {
  const { cancelled: _, ...safe } = run
  return safe
}

function requireWorkflow(runtime: LocalServerRuntime, id: string | undefined) {
  if (!id) throw new Error('workflow id is required')
  const workflow = runtime.backend.workflows.get(id)
  if (!workflow) throw new Error(`workflow not found: ${id}`)
  return workflow
}

function hasValue(value: MaterialValue) {
  return Boolean(value.text || value.url || value.localPath)
}

function isRecord(value: unknown): value is Record<string, any> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

class CancelledError extends Error {}
