import {
  createExecutionPlan,
  createWorkflowContract,
  collectWorkflowInputSchema,
  generateWorkflowModule,
  validateWorkflowForRun,
  type AssetReference,
  type MaterialNode,
  type MaterialValue,
  type NodeResult,
  type UpstreamResultReference,
  type WorkflowDocument,
  type WorkflowEdge,
  type WorkflowInputValueType,
  type WorkflowExecutionPlan,
} from '@red-video-flow/workflow-core'
import type { VisualCapability } from '@red-video-flow/plugin-contract'
import { handleDurableAppRunRoutes } from '@red-video-flow/api-server'
import type { LocalServerRuntime } from '../runtime.js'
import { readJson, resourcePath, sendJson, type RequestContext } from '../http.js'
import { requireRequestUser, resolveRequestUser } from '../auth.js'

type AppRunStatus = 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled'

type AppRunEvent = {
  id: number
  type: 'started' | 'node_started' | 'node_completed' | 'completed' | 'failed' | 'cancelled'
  nodeId?: string
  message?: string
  createdAt: number
}

export type AppRun = {
  id: string
  userId?: string
  workflowId: string
  revision: number
  status: AppRunStatus
  inputs: Record<string, unknown>
  graphSnapshot: WorkflowDocument
  executionPlan: WorkflowExecutionPlan
  nodeStates: Record<string, {
    status: 'pending' | 'running' | 'succeeded' | 'failed' | 'cancelled' | 'skipped'
    resultIds: string[]
    startedAt?: number
    finishedAt?: number
    error?: string
  }>
  outputs?: Record<string, MaterialValue>
  error?: string
  events: AppRunEvent[]
  createdAt: number
  updatedAt: number
  cancelled: boolean
}

export async function handleWorkflowAppRoutes(runtime: LocalServerRuntime, ctx: RequestContext) {
  const { req, res, pathname } = ctx
  if (
    runtime.postgresInfrastructure
    && (
      pathname.startsWith('/api/workflow-runs/')
      || /^\/api\/workflows\/[^/]+\/runs$/.test(pathname)
    )
  ) {
    const user = await requireRequestUser(runtime, req)
    return handleDurableAppRunRoutes({
      config: { workerConcurrency: runtime.config.workerConcurrency },
      infrastructure: runtime.postgresInfrastructure,
      providers: runtime.backend.providers,
    }, ctx, user.id)
  }

  if (req.method === 'GET' && /^\/api\/workflows\/[^/]+\/contract$/.test(pathname)) {
    const workflowId = resourcePath(pathname, '/api/workflows/')?.[0]
    const workflow = requireWorkflow(runtime, workflowId)
    sendJson(res, 200, { contract: createWorkflowContract(workflow) })
    return true
  }

  if (req.method === 'GET' && /^\/api\/workflows\/[^/]+\/code$/.test(pathname)) {
    const workflowId = resourcePath(pathname, '/api/workflows/')?.[0]
    const workflow = requireWorkflow(runtime, workflowId)
    const language = ctx.url.searchParams.get('language') === 'js' ? 'js' : 'ts'
    sendJson(res, 200, generateWorkflowModule(workflow, { language }))
    return true
  }

  if (req.method === 'POST' && /^\/api\/workflows\/[^/]+\/runs$/.test(pathname)) {
    const workflowId = resourcePath(pathname, '/api/workflows/')?.[0]
    const workflow = requireWorkflow(runtime, workflowId)
    const body = await readJson(req)
    if (typeof body.revision === 'number' && body.revision !== workflow.revision) {
      sendJson(res, 409, {
        error: 'workflow_revision_conflict',
        message: '工作流已发生更新，请保存后重试',
        expectedRevision: body.revision,
        currentRevision: workflow.revision,
      })
      return true
    }
    const user = await resolveRequestUser(runtime, req)
    const inputs = isRecord(body.inputs) ? body.inputs : {}
    const result = await createWorkflowAppRunFromInputs(runtime, workflow.id, inputs, user?.id)
    if (!result.ok) {
      sendJson(res, 422, result.error)
      return true
    }
    const run = result.run
    sendJson(res, 202, { run: publicRun(run) })
    return true
  }

  if (req.method === 'GET' && /^\/api\/workflows\/[^/]+\/runs$/.test(pathname)) {
    const workflowId = resourcePath(pathname, '/api/workflows/')?.[0]
    if (!workflowId) return false
    sendJson(res, 200, {
      runs: runtime.backend.workflowAppRuns.listByWorkflow<AppRun>(workflowId).map(publicRun),
    })
    return true
  }

  if (req.method === 'GET' && pathname.startsWith('/api/workflow-runs/')) {
    const runId = resourcePath(pathname, '/api/workflow-runs/')?.[0]
    if (!runId) return false
    const run = runtime.backend.workflowAppRuns.get<AppRun>(runId)
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
    const run = runtime.backend.workflowAppRuns.get<AppRun>(runId)
    if (!run) {
      sendJson(res, 404, { error: `workflow run not found: ${runId}` })
      return true
    }
    if (run.status === 'queued' || run.status === 'running') {
      run.cancelled = true
      run.status = 'cancelled'
      addEvent(runtime, run, 'cancelled', undefined, '运行已取消')
    }
    sendJson(res, 200, { run: publicRun(run) })
    return true
  }

  return false
}

export async function createWorkflowAppRunFromInputs(
  runtime: LocalServerRuntime,
  workflowId: string,
  inputs: Record<string, unknown>,
  userId?: string,
  revision?: number,
  subgraphId?: string,
) {
  const sourceWorkflow = requireWorkflow(runtime, workflowId)
  if (revision !== undefined && sourceWorkflow.revision !== revision) {
    return {
      ok: false as const,
      error: {
        error: 'workflow_revision_conflict',
        message: '绑定的工作流版本已发生变化，请重新发布应用能力',
        expectedRevision: revision,
        currentRevision: sourceWorkflow.revision,
      },
    }
  }
  const workflow = subgraphId ? workflowSubgraph(sourceWorkflow, subgraphId) : sourceWorkflow
  const validation = validateWorkflowForRun(workflow, inputs)
  if (!validation.valid) {
    return {
      ok: false as const,
      error: {
        error: 'workflow_validation_failed',
        message: '工作流运行前校验未通过',
        issues: validation.issues,
      },
    }
  }
  const run = createRun(workflow, inputs, userId)
  runtime.backend.workflowAppRuns.save(run)
  if (runtime.postgresInfrastructure) await runtime.flushPersistence()
  await runtime.backend.jobs.enqueue({
    id: `schedule-workflow:${run.id}`,
    type: 'schedule-workflow',
    payload: { runId: run.id },
    maxAttempts: 1,
  })
  return { ok: true as const, run }
}

export function publicWorkflowAppRun(run: AppRun) {
  return publicRun(run)
}

async function executeRun(
  runtime: LocalServerRuntime,
  workflow: WorkflowDocument,
  run: AppRun,
) {
  try {
    const inputSchema = collectWorkflowInputSchema(workflow)
    const values = new Map(workflow.graph.nodes.map((node) => [node.id, { ...node.data.value }]))
    const nodeResults = new Map<string, NodeResult[]>()
    for (const field of Object.values(inputSchema)) {
      const provided = field.key in run.inputs
      const rawInput = provided ? run.inputs[field.key] : field.defaultValue
      if (rawInput === undefined && field.required) throw new Error(`missing required input: ${field.key}`)
      if (rawInput !== undefined) {
        validateWorkflowInput(field, rawInput)
        values.set(field.nodeId, inputValue(field.valueType, rawInput))
      }
    }

    run.status = 'running'
    addEvent(runtime, run, 'started', undefined, 'Workflow 开始运行')
    const plan = createExecutionPlan(workflow.graph)

    for (const level of plan.levels) {
      if (run.cancelled) throw new CancelledError()
      const executable = level
        .map((nodeId) => workflow.graph.nodes.find((node) => node.id === nodeId)!)
        .filter((node) => !isInputNode(node))
      await mapWithConcurrency(executable, 3, async (node) => {
        if (run.cancelled) throw new CancelledError()
        const upstream = upstreamNodes(node, workflow.graph.nodes, workflow.graph.edges, values)
        run.nodeStates[node.id] = {
          ...run.nodeStates[node.id],
          status: 'running',
          startedAt: Date.now(),
        }
        addEvent(runtime, run, 'node_started', node.id, `开始执行 ${node.data.title}`)
        try {
          const result = node.data.composer
            ? await executeComposerNode(runtime, workflow, run, node, upstream, nodeResults)
            : {
                value: node.data.materialType === 'text'
                  ? executeTextNode(node, upstream, values.get(node.id))
                  : await executeVisualNode(runtime, run, node, upstream),
                results: [] as NodeResult[],
              }
          values.set(node.id, result.value)
          nodeResults.set(node.id, result.results)
          run.nodeStates[node.id] = {
            ...run.nodeStates[node.id],
            status: 'succeeded',
            resultIds: result.results.map((item) => item.id),
            finishedAt: Date.now(),
          }
          addEvent(runtime, run, 'node_completed', node.id, `完成 ${node.data.title}`)
        } catch (error) {
          run.nodeStates[node.id] = {
            ...run.nodeStates[node.id],
            status: 'failed',
            resultIds: [],
            finishedAt: Date.now(),
            error: error instanceof Error ? error.message : String(error),
          }
          throw error
        }
      })
    }

    run.outputs = Object.fromEntries(outputNodes(workflow).map((node) => {
      const label = node.data.serviceLabel?.trim() || node.id
      const value = values.get(node.id)
      if (!value || !hasValue(value)) throw new Error(`output has no value: ${label}`)
      return [label, value]
    }))
    run.status = 'succeeded'
    addEvent(runtime, run, 'completed', undefined, 'Workflow 运行完成')
  } catch (error) {
    if (error instanceof CancelledError || run.cancelled) {
      run.status = 'cancelled'
      markRemainingNodes(run, 'cancelled')
      if (!run.events.some((event) => event.type === 'cancelled')) {
        addEvent(runtime, run, 'cancelled', undefined, '运行已取消')
      }
    } else {
      run.status = 'failed'
      run.error = error instanceof Error ? error.message : String(error)
      markRemainingNodes(run, 'skipped')
      addEvent(runtime, run, 'failed', undefined, run.error)
    }
  }
}

export async function startWorkflowAppRun(
  runtime: LocalServerRuntime,
  runId: string,
) {
  const run = runtime.backend.workflowAppRuns.get<AppRun>(runId)
  if (!run) throw new Error(`workflow run not found: ${runId}`)
  if (run.status !== 'queued' && run.status !== 'running') return
  await executeRun(runtime, run.graphSnapshot, run)
}

export function workflowSubgraph(workflow: WorkflowDocument, subgraphId: string): WorkflowDocument {
  const subgraph = workflow.graph.subgraphs?.find((item) => item.id === subgraphId)
  if (!subgraph) throw new Error(`subgraph not found: ${subgraphId}`)
  const nodeIds = new Set(subgraph.nodeIds)
  return {
    ...structuredClone(workflow),
    title: subgraph.name,
    graph: {
      nodes: workflow.graph.nodes.filter((node) => nodeIds.has(node.id)),
      edges: workflow.graph.edges.filter((edge) => nodeIds.has(edge.source) && nodeIds.has(edge.target)),
      subgraphs: [structuredClone(subgraph)],
    },
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

function inputValue(
  type: MaterialNode['data']['materialType'] | WorkflowInputValueType,
  input: unknown,
): MaterialValue {
  if (type === 'text') {
    if (typeof input !== 'string') throw new Error('text input must be a string')
    return { text: input }
  }
  if (type === 'number') {
    if (typeof input !== 'number' || !Number.isFinite(input)) throw new Error('number input must be finite')
    return { text: String(input) }
  }
  if (type === 'boolean') {
    if (typeof input !== 'boolean') throw new Error('boolean input must be a boolean')
    return { text: String(input) }
  }
  if (type === 'image[]') {
    if (!Array.isArray(input) || !input.length) throw new Error('image[] input must contain assets')
    const first = input[0]
    if (!isRecord(first)) throw new Error('image[] input must contain uploaded assets')
    return assetValue(first, 'image')
  }
  if (!isRecord(input)) throw new Error(`${type} input must be an uploaded asset`)
  return assetValue(input, type)
}

function assetValue(input: Record<string, unknown>, type: string): MaterialValue {
  const value = {
    url: typeof input.url === 'string' ? input.url : undefined,
    localPath: typeof input.localPath === 'string' ? input.localPath : undefined,
    fileName: typeof input.fileName === 'string' ? input.fileName : undefined,
    mimeType: typeof input.mimeType === 'string' ? input.mimeType : undefined,
  }
  if (!value.url && !value.localPath) throw new Error(`${type} input has no url or localPath`)
  return value
}

function validateWorkflowInput(
  field: ReturnType<typeof collectWorkflowInputSchema>[string],
  input: unknown,
) {
  const constraints = field.constraints
  if (!constraints) return
  if (typeof input === 'string' && constraints.maxLength !== undefined) {
    if (input.length > constraints.maxLength) {
      throw new Error(`${field.key} exceeds maxLength ${constraints.maxLength}`)
    }
  }
  if (typeof input === 'number') {
    if (constraints.min !== undefined && input < constraints.min) {
      throw new Error(`${field.key} must be at least ${constraints.min}`)
    }
    if (constraints.max !== undefined && input > constraints.max) {
      throw new Error(`${field.key} must be at most ${constraints.max}`)
    }
  }
  if (Array.isArray(input)) {
    if (constraints.minItems !== undefined && input.length < constraints.minItems) {
      throw new Error(`${field.key} requires at least ${constraints.minItems} items`)
    }
    if (constraints.maxItems !== undefined && input.length > constraints.maxItems) {
      throw new Error(`${field.key} allows at most ${constraints.maxItems} items`)
    }
  }
}

function createRun(
  workflow: WorkflowDocument,
  inputs: Record<string, unknown>,
  userId?: string,
): AppRun {
  const now = Date.now()
  const graphSnapshot = structuredClone(workflow)
  const executionPlan = createExecutionPlan(graphSnapshot.graph)
  return {
    id: `app-run-${now}-${Math.round(Math.random() * 1_000_000)}`,
    userId,
    workflowId: workflow.id,
    revision: workflow.revision,
    status: 'queued',
    inputs,
    graphSnapshot,
    executionPlan,
    nodeStates: Object.fromEntries(workflow.graph.nodes.map((node) => [
      node.id,
      {
        status: isInputNode(node) ? 'succeeded' : 'pending',
        resultIds: [],
        ...(isInputNode(node) ? { startedAt: now, finishedAt: now } : {}),
      },
    ])),
    events: [],
    createdAt: now,
    updatedAt: now,
    cancelled: false,
  }
}

function addEvent(
  runtime: LocalServerRuntime,
  run: AppRun,
  type: AppRunEvent['type'],
  nodeId?: string,
  message?: string,
) {
  const now = Date.now()
  run.events.push({ id: run.events.length + 1, type, nodeId, message, createdAt: now })
  run.updatedAt = now
  runtime.backend.workflowAppRuns.save(run)
}

function publicRun(run: AppRun) {
  const { cancelled: _, userId: __, ...safe } = run
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

async function mapWithConcurrency<T>(
  values: T[],
  limit: number,
  execute: (value: T) => Promise<void>,
) {
  let nextIndex = 0
  let failed: unknown
  const workers = Array.from(
    { length: Math.min(Math.max(1, limit), values.length) },
    async () => {
      while (nextIndex < values.length && !failed) {
        const value = values[nextIndex++]
        try {
          await execute(value)
        } catch (error) {
          failed = error
        }
      }
    },
  )
  await Promise.all(workers)
  if (failed) throw failed
}

function markRemainingNodes(run: AppRun, status: 'cancelled' | 'skipped') {
  const now = Date.now()
  for (const state of Object.values(run.nodeStates)) {
    if (state.status === 'pending') {
      state.status = status
      state.finishedAt = now
    }
  }
}

function outputNodes(workflow: WorkflowDocument) {
  const explicit = workflow.graph.nodes.filter((node) => node.data.serviceRole === 'output')
  if (explicit.length) return explicit
  const hasDownstream = new Set(workflow.graph.edges.map((edge) => edge.source))
  return workflow.graph.nodes.filter((node) => !hasDownstream.has(node.id))
}

function isInputNode(node: MaterialNode) {
  return node.data.executionMode === 'input'
    || node.data.serviceRole === 'input'
    || Boolean(node.data.workflowInput)
}

async function executeComposerNode(
  runtime: LocalServerRuntime,
  workflow: WorkflowDocument,
  workflowRun: AppRun,
  node: MaterialNode,
  upstream: MaterialNode[],
  resultsByNodeId: Map<string, NodeResult[]>,
) {
  const composer = node.data.composer!
  const upstreamResults = collectUpstreamResultReferences(
    workflowRun.id,
    node,
    upstream,
    workflow.graph.edges,
    resultsByNodeId,
  )
  persistTopologyComposerContext(runtime, workflow.id, node.id, upstreamResults)
  const run = runtime.backend.runs.createNodeRun({
    userId: workflowRun.userId,
    workflowId: workflow.id,
    nodeId: node.id,
    input: {
      prompt: composer.prompt,
      attachments: composer.attachments,
      upstreamResults,
      model: composer.model,
      generationConfig: composer.generationConfig,
    },
  })
  await runtime.backend.jobs.enqueue({
    id: `execute-node:${run.id}`,
    type: 'execute-node',
    payload: { runId: run.id },
    maxAttempts: 1,
  })
  const completed = await waitForNodeRun(runtime, run.id, workflowRun)
  if (completed.status !== 'succeeded') {
    throw new Error(completed.error?.message || `${node.data.title} 执行失败`)
  }
  const currentWorkflow = runtime.backend.workflows.get(workflow.id)
  const currentNode = currentWorkflow?.graph.nodes.find((item) => item.id === node.id)
  const results = (currentNode?.data.results ?? []).filter(
    (result) => completed.resultIds.includes(result.id),
  )
  return {
    value: resultValue(results.at(-1)) ?? currentNode?.data.value ?? {},
    results,
  }
}

function persistTopologyComposerContext(
  runtime: LocalServerRuntime,
  workflowId: string,
  nodeId: string,
  upstreamResults: UpstreamResultReference[],
) {
  const current = runtime.backend.workflows.get(workflowId)
  const node = current?.graph.nodes.find((item) => item.id === nodeId)
  if (!current || !node?.data.composer) return
  runtime.backend.workflows.patch({
    id: workflowId,
    baseRevision: current.revision,
    ops: [{
      type: 'setNodeComposer',
      nodeId,
      composer: {
        ...node.data.composer,
        upstreamResults,
        updatedAt: Date.now(),
      },
    }],
  })
}

async function waitForNodeRun(
  runtime: LocalServerRuntime,
  runId: string,
  workflowRun: AppRun,
) {
  while (true) {
    if (workflowRun.cancelled) {
      runtime.backend.visualTasks.cancelNodeRun(runId)
      return runtime.backend.runs.cancelNodeRun(runId)
    }
    const run = runtime.backend.runs.getNodeRun(runId)
    if (!run) throw new Error(`node run not found: ${runId}`)
    if (!['queued', 'running'].includes(run.status)) return run
    await delay(50)
  }
}

function collectUpstreamResultReferences(
  workflowRunId: string,
  node: MaterialNode,
  upstream: MaterialNode[],
  edges: WorkflowEdge[],
  resultsByNodeId: Map<string, NodeResult[]>,
): UpstreamResultReference[] {
  const references: UpstreamResultReference[] = []
  for (const upstreamNode of upstream) {
    const edge = edges.find((item) => item.source === upstreamNode.id && item.target === node.id)!
    const results = resultsByNodeId.get(upstreamNode.id) ?? []
    if (results.length) {
      for (const result of results) {
        references.push({
          edgeId: edge.id ?? `${edge.source}-${edge.target}`,
          nodeId: upstreamNode.id,
          resultId: result.id,
          resultType: result.type,
          assets: resultAssets(result),
          text: result.type === 'text' ? result.text : undefined,
        })
      }
      continue
    }
    const value = upstreamNode.data.value
    references.push({
      edgeId: edge.id ?? `${edge.source}-${edge.target}`,
      nodeId: upstreamNode.id,
      resultId: `${workflowRunId}:${upstreamNode.id}`,
      resultType: upstreamNode.data.materialType,
      assets: materialValueAssets(workflowRunId, upstreamNode),
      text: value.text,
    })
  }
  return references
}

function resultAssets(result: NodeResult): AssetReference[] {
  if (result.type === 'image') return result.images
  if (result.type === 'video') return [result.video, ...(result.lastFrame ? [result.lastFrame] : [])]
  return []
}

function materialValueAssets(workflowRunId: string, node: MaterialNode): AssetReference[] {
  const value = node.data.value
  if (node.data.materialType === 'text' || (!value.url && !value.localPath)) return []
  return [{
    id: `${workflowRunId}:${node.id}:asset`,
    kind: node.data.materialType,
    url: value.url ?? value.localPath!,
    name: value.fileName,
    mimeType: value.mimeType,
    duration: value.duration,
  }]
}

function resultValue(result: NodeResult | undefined): MaterialValue | undefined {
  if (!result) return undefined
  if (result.type === 'text') return { text: result.text }
  if (result.type === 'image') {
    const image = result.images[0]
    return image ? {
      url: image.url,
      fileName: image.name,
      mimeType: image.mimeType,
    } : undefined
  }
  return {
    url: result.video.url,
    fileName: result.video.name,
    mimeType: result.video.mimeType,
    duration: result.video.duration,
  }
}
