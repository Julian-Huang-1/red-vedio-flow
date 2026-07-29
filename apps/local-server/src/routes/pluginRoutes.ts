import type { ExecutionStatus } from '@red-video-flow/local-backend'
import type { LocalServerRuntime } from '../runtime.js'
import {
  readJson,
  resourcePath,
  sendJson,
  writeExecutionSse,
  type RequestContext,
} from '../http.js'

export async function handlePluginRoutes(runtime: LocalServerRuntime, ctx: RequestContext) {
  const { req, res, pathname, url } = ctx
  const { plugins, executions } = runtime

  if (req.method === 'GET' && pathname === '/api/plugins') {
    sendJson(res, 200, {
      plugins: plugins.list(),
      discoveryErrors: plugins.listDiscoveryErrors(),
    })
    return true
  }

  const pluginPath = resourcePath(pathname, '/api/plugins/')
  if (pluginPath && !plugins.has(pluginPath[0])) {
    sendJson(res, 404, { error: 'plugin not found' })
    return true
  }
  if (pluginPath?.length === 1 && req.method === 'GET') {
    sendJson(res, 200, { plugin: plugins.describe(pluginPath[0]) })
    return true
  }
  if (pluginPath?.length === 2 && pluginPath[1] === 'reload' && req.method === 'POST') {
    sendJson(res, 200, { plugin: await plugins.reload(pluginPath[0]) })
    return true
  }
  if (pluginPath?.length === 2 && pluginPath[1] === 'health' && req.method === 'GET') {
    sendJson(res, 200, {
      pluginId: pluginPath[0],
      health: await plugins.health(pluginPath[0]),
    })
    return true
  }

  if (req.method === 'GET' && pathname === '/api/commands') {
    sendJson(res, 200, { commands: plugins.contributions.listCommands() })
    return true
  }

  if (req.method === 'GET' && pathname === '/api/node-executors') {
    sendJson(res, 200, { nodeExecutors: plugins.contributions.listNodeExecutors() })
    return true
  }
  const nodeExecutorPath = resourcePath(pathname, '/api/node-executors/')
  if (
    nodeExecutorPath?.length === 2
    && nodeExecutorPath[1] === 'executions'
    && req.method === 'POST'
  ) {
    const executor = plugins.contributions.getNodeExecutor(nodeExecutorPath[0])
    if (!executor) {
      sendJson(res, 404, { error: 'node executor not found' })
      return true
    }
    const body = await readJson(req)
    const timeoutError = validateTimeout(body.timeoutMs)
    if (timeoutError) {
      sendJson(res, 400, { error: timeoutError })
      return true
    }
    sendJson(res, 202, {
      execution: executions.startNodeExecutor(
        nodeExecutorPath[0],
        body.input,
        body.timeoutMs,
      ),
    })
    return true
  }

  if (req.method === 'GET' && pathname === '/api/background-workers') {
    sendJson(res, 200, {
      backgroundWorkers: plugins.contributions.listBackgroundWorkers(),
    })
    return true
  }
  const workerPath = resourcePath(pathname, '/api/background-workers/')
  if (workerPath?.length === 2 && req.method === 'POST') {
    const worker = plugins.contributions.getBackgroundWorker(workerPath[0])
    if (!worker) {
      sendJson(res, 404, { error: 'background worker not found' })
      return true
    }
    if (workerPath[1] === 'start') {
      const body = await readJson(req)
      sendJson(res, 200, {
        workerId: workerPath[0],
        result: await plugins.startWorker(workerPath[0], body.input),
      })
      return true
    }
    if (workerPath[1] === 'stop') {
      sendJson(res, 200, {
        workerId: workerPath[0],
        result: await plugins.stopWorker(workerPath[0]),
      })
      return true
    }
  }

  const commandPath = resourcePath(pathname, '/api/commands/')
  if (commandPath?.length === 1 && req.method === 'GET') {
    const command = plugins.contributions.getCommand(commandPath[0])
    if (!command) {
      sendJson(res, 404, { error: 'command not found' })
      return true
    }
    sendJson(res, 200, { command })
    return true
  }
  if (commandPath?.length === 2 && commandPath[1] === 'executions' && req.method === 'POST') {
    const command = plugins.contributions.getCommand(commandPath[0])
    if (!command) {
      sendJson(res, 404, { error: 'command not found' })
      return true
    }
    const body = await readJson(req)
    const timeoutError = validateTimeout(body.timeoutMs)
    if (timeoutError) {
      sendJson(res, 400, { error: timeoutError })
      return true
    }
    const execution = executions.startCommand(
      commandPath[0],
      body.input,
      typeof body.timeoutMs === 'number' ? body.timeoutMs : undefined,
    )
    sendJson(res, 202, { execution })
    return true
  }

  const executionPath = resourcePath(pathname, '/api/executions/')
  if (executionPath?.length === 1 && req.method === 'GET') {
    const execution = executions.get(executionPath[0])
    if (!execution) {
      sendJson(res, 404, { error: 'execution not found' })
      return true
    }
    sendJson(res, 200, { execution })
    return true
  }
  if (executionPath?.length === 2 && executionPath[1] === 'cancel' && req.method === 'POST') {
    const execution = executions.get(executionPath[0])
    if (!execution) {
      sendJson(res, 404, { error: 'execution not found' })
      return true
    }
    sendJson(res, 200, { execution: await executions.cancel(executionPath[0]) })
    return true
  }
  if (executionPath?.length === 2 && executionPath[1] === 'events' && req.method === 'GET') {
    const execution = executions.get(executionPath[0])
    if (!execution) {
      sendJson(res, 404, { error: 'execution not found' })
      return true
    }
    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'Access-Control-Allow-Origin': '*',
    })
    const afterSequence = Number(req.headers['last-event-id'] ?? url.searchParams.get('after') ?? 0)
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
      writeExecutionSse(res, event)
      const latest = executions.get(execution.id)
      if (latest && isTerminal(latest.status)) queueMicrotask(finish)
    }, Number.isFinite(afterSequence) ? afterSequence : 0)
    const latest = executions.get(execution.id)
    if (latest && isTerminal(latest.status)) queueMicrotask(finish)
    res.on('close', () => {
      ended = true
      unsubscribe()
    })
    return true
  }

  return false
}

function isTerminal(status: ExecutionStatus) {
  return ['succeeded', 'failed', 'cancelled', 'timed_out', 'interrupted'].includes(status)
}

function validateTimeout(value: unknown) {
  return value !== undefined
    && (typeof value !== 'number' || !Number.isFinite(value) || value < 0)
    ? 'timeoutMs must be a finite number greater than or equal to 0'
    : undefined
}
