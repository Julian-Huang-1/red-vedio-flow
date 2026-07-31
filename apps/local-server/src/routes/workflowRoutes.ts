import type { LocalServerRuntime } from '../runtime.js'
import {
  handleWorkflowRoutes as handleSharedWorkflowRoutes,
  type WorkflowApi,
} from '@red-video-flow/api-server'
import { readJson, sendJson, type RequestContext } from '../http.js'
import { workflowDataService } from '../dataServices.js'

export async function handleWorkflowRoutes(runtime: LocalServerRuntime, ctx: RequestContext) {
  const { req, res, pathname, url } = ctx
  const { backend, visualTasks } = runtime
  const workflows = workflowDataService(runtime)
  const workflowApi: WorkflowApi = {
    list: () => workflows.list(),
    get: (id) => workflows.get(id),
    create: (input) => workflows.create(input),
    save: (input) => workflows.save(input),
    patch: (input) => workflows.patch(input),
    delete: (id) => workflows.delete(id),
  }

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

  if (await handleSharedWorkflowRoutes(ctx, workflowApi)) return true

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

  return false
}

function nodeRunPathFromPath(pathname: string) {
  const prefix = '/api/workflows/'
  if (!pathname.startsWith(prefix)) return undefined
  const parts = pathname.slice(prefix.length).split('/').map((part) => decodeURIComponent(part))
  const [workflowId, nodesLiteral, nodeId, runsLiteral, runId, action] = parts
  if (!workflowId || nodesLiteral !== 'nodes' || !nodeId || runsLiteral !== 'runs') return undefined
  return { workflowId, nodeId, runId, action }
}
