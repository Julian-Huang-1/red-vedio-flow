import { join } from 'node:path'
import type { LocalServerRuntime } from '../runtime.js'
import { readJson, sendJson, writeSse, type RequestContext } from '../http.js'

export async function handleRunRoutes(runtime: LocalServerRuntime, ctx: RequestContext) {
  const { req, res, pathname } = ctx
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
