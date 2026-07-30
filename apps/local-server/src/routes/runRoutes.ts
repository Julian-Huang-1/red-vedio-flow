import { join } from 'node:path'
import type { UpstreamResultReference } from '@red-video-flow/workflow-core'
import type { LocalServerRuntime } from '../runtime.js'
import { readJson, sendJson, writeSse, type RequestContext } from '../http.js'
import { startDurableWorkflowNodeRun } from '../nodeExecutionService.js'

export async function handleRunRoutes(runtime: LocalServerRuntime, ctx: RequestContext) {
  const { req, res, pathname } = ctx
  if (req.method === 'POST' && pathname === '/api/workflow-node-runs') {
    await runWorkflowNode(runtime, ctx)
    return true
  }
  if (req.method === 'GET' && pathname === '/api/workflow-node-runs') {
    const workflowId = ctx.url.searchParams.get('workflowId')
    if (!workflowId) sendJson(res, 400, { error: 'workflowId is required' })
    else sendJson(res, 200, { runs: runtime.backend.runs.listNodeRuns(workflowId) })
    return true
  }
  const nodeRunMatch = pathname.match(/^\/api\/workflow-node-runs\/([^/]+)$/)
  if (req.method === 'GET' && nodeRunMatch) {
    const run = runtime.backend.runs.getNodeRun(decodeURIComponent(nodeRunMatch[1]))
    sendJson(res, run ? 200 : 404, run ? { run } : { error: 'run not found' })
    return true
  }
  const eventMatch = pathname.match(/^\/api\/workflow-node-runs\/([^/]+)\/events$/)
  if (req.method === 'GET' && eventMatch) {
    streamNodeRunEvents(runtime, ctx, decodeURIComponent(eventMatch[1]))
    return true
  }
  const cancelMatch = pathname.match(/^\/api\/workflow-node-runs\/([^/]+)\/cancel$/)
  if (req.method === 'POST' && cancelMatch) {
    const runId = decodeURIComponent(cancelMatch[1])
    if (!runtime.backend.runs.getNodeRun(runId)) sendJson(res, 404, { error: 'run not found' })
    else {
      runtime.backend.visualTasks.cancelNodeRun(runId)
      sendJson(res, 200, { run: runtime.backend.runs.cancelNodeRun(runId) })
    }
    return true
  }
  if (req.method === 'POST' && pathname === '/api/run-node') {
    await runAgent(runtime, ctx)
    return true
  }
  if (req.method === 'POST' && pathname === '/api/run-visual-node') {
    await runVisual(runtime, ctx)
    return true
  }
  return false
}

async function runWorkflowNode(runtime: LocalServerRuntime, ctx: RequestContext) {
  const { req, res } = ctx
  const body = await readJson(req)
  const runId = typeof body.runId === 'string' ? body.runId : undefined
  const workflowId = typeof body.workflowId === 'string' ? body.workflowId : undefined
  const nodeId = typeof body.nodeId === 'string' ? body.nodeId : undefined
  if (!workflowId || !nodeId || !isRecord(body.input)) {
    sendJson(res, 400, { error: 'workflowId, nodeId and input are required' })
    return
  }

  persistComposerUpstreamResults(runtime, workflowId, nodeId, body.input.upstreamResults)
  const run = runtime.backend.runs.createNodeRun({
    id: runId,
    workflowId,
    nodeId,
    input: body.input,
  })
  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    'Access-Control-Allow-Origin': '*',
  })
  const unsubscribe = runtime.backend.runs.subscribeNodeRun(run.id, (event) => {
    writeSse(res, event.data)
    if (event.type === 'done' || event.type === 'error') {
      unsubscribe()
      res.end()
    }
  })
  const history = runtime.backend.runs.listNodeRunEvents(run.id)
  for (const event of history) writeSse(res, event.data)
  if (!['queued', 'running'].includes(run.status)) {
    unsubscribe()
    res.end()
    return
  }
  res.on('close', unsubscribe)
  void startDurableWorkflowNodeRun(runtime, run.id).catch((error) => {
    runtime.backend.runs.failNodeRun(run.id, {
      code: 'execution_failed',
      message: error instanceof Error ? error.message : String(error),
      retryable: true,
    })
  })
}

function persistComposerUpstreamResults(
  runtime: LocalServerRuntime,
  workflowId: string,
  nodeId: string,
  upstreamResults: unknown,
) {
  if (!Array.isArray(upstreamResults)) return
  const workflow = runtime.backend.workflows.get(workflowId)
  const node = workflow?.graph.nodes.find((item) => item.id === nodeId)
  if (!workflow || !node?.data.composer) return
  runtime.backend.workflows.patch({
    id: workflowId,
    baseRevision: workflow.revision,
    ops: [{
      type: 'setNodeComposer',
      nodeId,
      composer: {
        ...node.data.composer,
        upstreamResults: upstreamResults as UpstreamResultReference[],
        updatedAt: Date.now(),
      },
    }],
  })
}

function streamNodeRunEvents(runtime: LocalServerRuntime, ctx: RequestContext, runId: string) {
  const { req, res, url } = ctx
  const run = runtime.backend.runs.getNodeRun(runId)
  if (!run) {
    sendJson(res, 404, { error: 'run not found' })
    return
  }
  const after = Number(url.searchParams.get('after') ?? req.headers['last-event-id'] ?? 0)
  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    'Access-Control-Allow-Origin': '*',
  })
  const write = (event: { id: number; data: unknown }) => {
    res.write(`id: ${event.id}\n`)
    writeSse(res, event.data)
  }
  const unsubscribe = runtime.backend.runs.subscribeNodeRun(runId, (event) => {
    write(event)
    if (event.type === 'done' || event.type === 'error') {
      unsubscribe()
      res.end()
    }
  })
  for (const event of runtime.backend.runs.listNodeRunEvents(runId, Number.isFinite(after) ? after : 0)) {
    write(event)
  }
  if (!['queued', 'running'].includes(run.status)) {
    unsubscribe()
    res.end()
  } else {
    res.on('close', unsubscribe)
  }
}

async function runAgent(runtime: LocalServerRuntime, ctx: RequestContext) {
  const { req, res } = ctx
  const { backend, plugins, executions, config } = runtime
  const body = await readJson(req)
  const agentId = body.agentId
  const baseUrl = body.baseUrl ?? `http://${req.headers.host}`
  const nodePrompt = backend.prompts.buildNodePrompt({
    ...body,
    baseUrl,
    rvfCommand: config.rvfCliCommand,
  })
  if (!agentId) {
    sendJson(res, 400, { error: 'agentId is required' })
    return
  }
  const registeredAgent = plugins.contributions.getAgentProvider(agentId)
  if (!registeredAgent) {
    sendJson(res, 404, { error: `agent provider not found: ${agentId}` })
    return
  }
  const registeredCli = runtime.agentRegistry.get(agentId)

  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    'Access-Control-Allow-Origin': '*',
  })
  const execution = executions.start({
    pluginId: registeredAgent.pluginId,
    contributionId: agentId,
    kind: 'agent',
    method: 'agent.execute',
    input: {
      prompt: nodePrompt,
      model: body.model,
      cwd: body.cwd,
      binPath: registeredCli?.binPath,
      env: {
        RED_VIDEO_FLOW_BASE_URL: baseUrl,
        RVF_WORKFLOW_ID: body.workflowId,
        RVF_NODE_ID: body.currentNode?.id,
        RVF_BASE_REVISION: body.workflowRevision === undefined
          ? undefined
          : String(body.workflowRevision),
        RVF_CLI_COMMAND: config.rvfCliCommand,
        PATH: [
          join(config.workspaceRoot, 'node_modules/.bin'),
          join(config.workspaceRoot, 'packages/workflow-cli/node_modules/.bin'),
          process.env.PATH ?? '',
        ].join(process.platform === 'win32' ? ';' : ':'),
      },
    },
  })

  let unsubscribe = () => {}
  let ended = false
  const finish = () => {
    if (ended) return
    ended = true
    unsubscribe()
    res.end()
  }
  unsubscribe = executions.subscribe(execution.id, (event) => {
    if (ended) return
    const data = isRecord(event.data) ? event.data : {}
    if (
      event.type === 'progress'
      && data.phase === 'spawned'
      && typeof data.bin === 'string'
      && Array.isArray(data.argv)
    ) {
      writeSse(res, { type: 'start', agentId, bin: data.bin, argv: data.argv })
    } else if (event.type === 'delta' && typeof data.text === 'string') {
      writeSse(res, { type: 'delta', text: data.text })
    } else if (event.type === 'stderr' && typeof data.text === 'string') {
      writeSse(res, { type: 'stderr', text: data.text })
    } else if (event.type === 'completed') {
      const result = isRecord(data.result) ? data.result : {}
      writeSse(res, {
        type: 'done',
        code: typeof result.exitCode === 'number' ? result.exitCode : null,
        output: typeof result.output === 'string' ? result.output : '',
      })
      queueMicrotask(finish)
    } else if (event.type === 'failed') {
      writeSse(res, { type: 'error', message: data.message ?? 'Agent execution failed' })
      queueMicrotask(finish)
    } else if (event.type === 'cancelled') {
      writeSse(res, { type: 'error', message: 'Agent execution cancelled' })
      queueMicrotask(finish)
    }
  })
  res.on('close', () => {
    const shouldCancel = !ended
    ended = true
    unsubscribe()
    if (shouldCancel) void executions.cancel(execution.id)
  })
}

async function runVisual(runtime: LocalServerRuntime, ctx: RequestContext) {
  const { req, res } = ctx
  const { backend } = runtime
  const body = await readJson(req)
  const runId = `${Date.now()}-${Math.round(Math.random() * 10000)}`
  const downloadDir = join(backend.assets.generatedDir, runId)
  const workflowId = typeof body.workflowId === 'string' ? body.workflowId : undefined
  const nodeId = typeof body.currentNode?.id === 'string' ? body.currentNode.id : undefined
  const nodeKind = body.nodeKind === 'image' || body.nodeKind === 'video' ? body.nodeKind : undefined
  const visualTask = workflowId && nodeId && nodeKind
    ? backend.visualTasks.start({
        workflowId,
        nodeId,
        provider: body.modelId ?? 'dreamina',
        nodeKind,
      })
    : undefined
  let taskRegistrationError: unknown

  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    'Access-Control-Allow-Origin': '*',
  })

  backend.visual.invoke({
    executionId: visualTask?.id,
    idempotencyKey: visualTask?.id,
    modelId: body.modelId ?? 'dreamina',
    nodeKind: body.nodeKind,
    prompt: body.prompt,
    upstream: body.upstream,
    providerOptions: isRecord(body.providerOptions) ? body.providerOptions : undefined,
    downloadDir,
    assetUrlForPath: (filePath) => backend.assets.assetUrlForPath(filePath),
    onEvent: (event) => {
      if (visualTask && event.type === 'meta') {
        try {
          backend.visualTasks.markSubmitted(visualTask.id, event.submitId)
        } catch (error) {
          taskRegistrationError = error
        }
      }
      writeSse(res, event)
    },
  }).then((result) => {
    if (taskRegistrationError) throw taskRegistrationError
    if (visualTask) backend.visualTasks.recordInitialResult(visualTask.id, result)
    writeSse(res, { type: 'done', result })
    res.end()
  }).catch((error) => {
    const persistedTask = visualTask
      ? backend.visualTasks.failSubmission(visualTask.id, error)
      : undefined
    if (persistedTask?.status === 'polling') {
      writeSse(res, {
        type: 'done',
        result: {
          submitId: persistedTask.submitId,
          taskStatus: 'querying',
          failReason: error instanceof Error ? error.message : String(error),
        },
      })
      res.end()
      return
    }
    writeSse(res, {
      type: 'error',
      message: error instanceof Error ? error.message : String(error),
    })
    res.end()
  })
}

function isRecord(value: unknown): value is Record<string, any> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}
