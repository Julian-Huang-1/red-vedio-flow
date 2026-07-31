import type { NodeRunInput } from '@red-video-flow/workflow-core'
import {
  HttpError,
  isRecord,
  pathParts,
  readJson,
  sendJson,
  type RequestContext,
} from './http.js'
import {
  cancelNodeRun,
  createNodeRun,
  toNodeRun,
} from './runService.js'
import type { DurableRuntime } from './runtime.js'

export async function handleDurableNodeRunRoutes(
  runtime: DurableRuntime,
  ctx: RequestContext,
  userId: string,
) {
  const { req, res, pathname } = ctx
  if (pathname === '/api/workflow-node-runs' && req.method === 'POST') {
    const body = await readJson(req)
    if (
      typeof body.workflowId !== 'string'
      || typeof body.nodeId !== 'string'
      || !isRecord(body.input)
    ) {
      throw new HttpError(400, 'workflowId, nodeId and input are required')
    }
    const run = await createNodeRun(runtime, {
      id: typeof body.runId === 'string' ? body.runId : undefined,
      userId,
      workflowId: body.workflowId,
      nodeId: body.nodeId,
      input: body.input as NodeRunInput,
    })
    await runtime.infrastructure.jobs.enqueue({
      id: `execute-node:${run.id}`,
      type: 'execute-node',
      payload: { runId: run.id },
      maxAttempts: 1,
    })
    await streamDurableRunEvents(runtime, ctx, run.id)
    return true
  }
  if (pathname === '/api/workflow-node-runs' && req.method === 'GET') {
    const workflowId = ctx.url.searchParams.get('workflowId')
    if (!workflowId) throw new HttpError(400, 'workflowId is required')
    const runs = await runtime.infrastructure.workflowRuns.listByWorkflow(workflowId)
    sendJson(res, 200, {
      runs: runs
        .filter((run) => run.userId === userId && run.inputSnapshot)
        .map(toNodeRun),
    })
    return true
  }
  const route = pathParts(pathname, '/api/workflow-node-runs/')
  if (!route?.length) return false
  const run = await runtime.infrastructure.workflowRuns.get(route[0])
  if (!run || run.userId !== userId) throw new HttpError(404, 'run not found')
  if (route.length === 1 && req.method === 'GET') {
    sendJson(res, 200, { run: toNodeRun(run) })
    return true
  }
  if (route.length === 2 && route[1] === 'cancel' && req.method === 'POST') {
    sendJson(res, 200, { run: await cancelNodeRun(runtime, run.id) })
    return true
  }
  if (route.length === 2 && route[1] === 'events' && req.method === 'GET') {
    await streamDurableRunEvents(runtime, ctx, run.id)
    return true
  }
  return false
}

export async function streamDurableRunEvents(
  runtime: DurableRuntime,
  ctx: RequestContext,
  runId: string,
) {
  let after = Number(
    ctx.url.searchParams.get('after')
      ?? ctx.req.headers['last-event-id']
      ?? 0,
  )
  if (!Number.isFinite(after)) after = 0
  ctx.res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  })
  let closed = false
  ctx.res.on('close', () => { closed = true })
  while (!closed) {
    const events = await runtime.infrastructure.workflowRuns.listEvents(runId, after)
    for (const event of events) {
      after = event.id
      ctx.res.write(`id: ${event.id}\ndata: ${JSON.stringify(event.data)}\n\n`)
    }
    const run = await runtime.infrastructure.workflowRuns.get(runId)
    if (!run || !['queued', 'running'].includes(run.status)) break
    await new Promise((resolve) => setTimeout(resolve, 500))
  }
  ctx.res.end()
}
