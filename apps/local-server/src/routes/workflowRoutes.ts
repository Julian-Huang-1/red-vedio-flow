import type { LocalServerRuntime } from '../runtime.js'
import { readJson, sendJson, type RequestContext } from '../http.js'
import { workflowDataService } from '../dataServices.js'

export async function handleWorkflowRoutes(runtime: LocalServerRuntime, ctx: RequestContext) {
  const { req, res, pathname, url } = ctx
  const { backend, visualTasks } = runtime
  const workflows = workflowDataService(runtime)

  if (req.method === 'GET' && pathname === '/api/health') {
    sendJson(res, 200, { ok: true, service: 'red-video-flow' })
    return true
  }

  if (req.method === 'GET' && pathname === '/api/visual-tasks') {
    const provider = url.searchParams.get('provider')?.trim()
    const submitId = url.searchParams.get('submitId')?.trim()
    if (!provider || !submitId) {
      sendJson(res, 400, { error: 'provider and submitId are required' })
      return true
    }
    const task = backend.visualTasks.findBySubmitId(provider, submitId)
    if (!task) {
      sendJson(res, 404, { error: 'visual task not found' })
      return true
    }
    sendJson(res, 200, { task })
    return true
  }

  if (req.method === 'GET' && pathname.startsWith('/api/visual-tasks/')) {
    const taskId = decodeURIComponent(pathname.slice('/api/visual-tasks/'.length))
    const task = backend.visualTasks.get(taskId)
    if (!task) {
      sendJson(res, 404, { error: 'visual task not found' })
      return true
    }
    sendJson(res, 200, { task })
    return true
  }

  if (req.method === 'POST' && pathname === '/api/visual-tasks/reconcile') {
    sendJson(res, 200, await visualTasks.tick())
    return true
  }

  if (req.method === 'GET' && pathname === '/api/workflows') {
    sendJson(res, 200, { workflows: await workflows.list() })
    return true
  }

  if (req.method === 'POST' && pathname === '/api/workflows') {
    sendJson(res, 200, await workflows.create(await readJson(req)))
    return true
  }

  const nodeRunPath = nodeRunPathFromPath(pathname)
  if (nodeRunPath && req.method === 'POST' && !nodeRunPath.runId) {
    const body = await readJson(req)
    sendJson(res, 200, backend.runs.start({
      workflowId: nodeRunPath.workflowId,
      nodeId: nodeRunPath.nodeId,
      prompt: body.prompt,
      baseRevision: body.baseRevision,
    }))
    return true
  }

  if (nodeRunPath && req.method === 'POST' && nodeRunPath.runId && nodeRunPath.action === 'heartbeat') {
    sendJson(res, 200, {
      run: backend.runs.heartbeat(nodeRunPath.workflowId, nodeRunPath.nodeId, nodeRunPath.runId),
    })
    return true
  }

  if (nodeRunPath && req.method === 'POST' && nodeRunPath.runId && nodeRunPath.action === 'complete') {
    const body = await readJson(req)
    sendJson(res, 200, backend.runs.complete({
      workflowId: nodeRunPath.workflowId,
      nodeId: nodeRunPath.nodeId,
      runId: nodeRunPath.runId,
      baseRevision: body.baseRevision,
      value: body.value,
      status: body.status,
      message: body.message ?? '生成完成',
    }))
    return true
  }

  if (nodeRunPath && req.method === 'POST' && nodeRunPath.runId && nodeRunPath.action === 'fail') {
    const body = await readJson(req)
    sendJson(res, 200, backend.runs.fail({
      workflowId: nodeRunPath.workflowId,
      nodeId: nodeRunPath.nodeId,
      runId: nodeRunPath.runId,
      baseRevision: body.baseRevision,
      message: body.message ?? 'Agent 执行失败',
    }))
    return true
  }

  const workflowId = workflowIdFromPath(pathname)
  if (workflowId && req.method === 'GET') {
    const workflow = await workflows.get(workflowId)
    if (!workflow) {
      sendJson(res, 404, { error: 'workflow not found' })
      return true
    }
    sendJson(res, 200, workflow)
    return true
  }
  if (workflowId && req.method === 'PUT') {
    const body = await readJson(req)
    sendJson(res, 200, await workflows.save({
      id: workflowId,
      title: body.title,
      baseRevision: body.baseRevision,
      graph: body.graph,
    }))
    return true
  }
  if (workflowId && req.method === 'PATCH') {
    const body = await readJson(req)
    sendJson(res, 200, {
      workflow: await workflows.patch({
        id: workflowId,
        baseRevision: body.baseRevision,
        ops: body.ops ?? [],
      }),
      appliedOps: Array.isArray(body.ops) ? body.ops.length : 0,
    })
    return true
  }
  if (workflowId && req.method === 'DELETE') {
    await workflows.delete(workflowId)
    sendJson(res, 200, { ok: true })
    return true
  }

  return false
}

function workflowIdFromPath(pathname: string) {
  const prefix = '/api/workflows/'
  if (!pathname.startsWith(prefix)) return undefined
  const id = pathname.slice(prefix.length)
  return id && !id.includes('/') ? decodeURIComponent(id) : undefined
}

function nodeRunPathFromPath(pathname: string) {
  const prefix = '/api/workflows/'
  if (!pathname.startsWith(prefix)) return undefined
  const parts = pathname.slice(prefix.length).split('/').map((part) => decodeURIComponent(part))
  const [workflowId, nodesLiteral, nodeId, runsLiteral, runId, action] = parts
  if (!workflowId || nodesLiteral !== 'nodes' || !nodeId || runsLiteral !== 'runs') return undefined
  return { workflowId, nodeId, runId, action }
}
