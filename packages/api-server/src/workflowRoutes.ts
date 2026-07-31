import {
  createWorkflowContract,
  generateWorkflowModule,
  type WorkflowDocument,
  type WorkflowPatchOperation,
} from '@red-video-flow/workflow-core'
import {
  HttpError,
  pathParts,
  readJson,
  sendJson,
  type RequestContext,
} from './http.js'

type Awaitable<T> = T | Promise<T>

export type WorkflowApi = {
  list(): Awaitable<WorkflowDocument[]>
  get(id: string): Awaitable<WorkflowDocument | undefined>
  create(input?: Record<string, unknown>): Awaitable<WorkflowDocument>
  save(input: {
    id: string
    title?: string
    baseRevision?: number
    graph: WorkflowDocument['graph']
  }): Awaitable<WorkflowDocument>
  patch(input: {
    id: string
    baseRevision: number
    ops: WorkflowPatchOperation[]
  }): Awaitable<WorkflowDocument>
  delete(id: string): Awaitable<unknown>
}

export async function handleWorkflowRoutes(
  ctx: RequestContext,
  workflows: WorkflowApi,
) {
  if (ctx.pathname === '/api/workflows' && ctx.req.method === 'GET') {
    sendJson(ctx.res, 200, { workflows: await workflows.list() })
    return true
  }
  if (ctx.pathname === '/api/workflows' && ctx.req.method === 'POST') {
    sendJson(ctx.res, 200, await workflows.create(await readJson(ctx.req)))
    return true
  }
  const route = pathParts(ctx.pathname, '/api/workflows/')
  if (!route?.length) return false
  const [workflowId, action] = route
  if (route.length === 2 && action === 'contract' && ctx.req.method === 'GET') {
    const workflow = await requireWorkflow(workflows, workflowId)
    sendJson(ctx.res, 200, { contract: createWorkflowContract(workflow) })
    return true
  }
  if (route.length === 2 && action === 'code' && ctx.req.method === 'GET') {
    const workflow = await requireWorkflow(workflows, workflowId)
    sendJson(ctx.res, 200, generateWorkflowModule(workflow, {
      language: ctx.url.searchParams.get('language') === 'js' ? 'js' : 'ts',
    }))
    return true
  }
  if (route.length !== 1) return false
  if (ctx.req.method === 'GET') {
    const workflow = await workflows.get(workflowId)
    sendJson(
      ctx.res,
      workflow ? 200 : 404,
      workflow ?? { error: 'workflow not found' },
    )
    return true
  }
  if (ctx.req.method === 'PUT') {
    const body = await readJson(ctx.req)
    sendJson(ctx.res, 200, await workflows.save({
      id: workflowId,
      title: typeof body.title === 'string' ? body.title : undefined,
      baseRevision: typeof body.baseRevision === 'number'
        ? body.baseRevision
        : undefined,
      graph: body.graph as WorkflowDocument['graph'],
    }))
    return true
  }
  if (ctx.req.method === 'PATCH') {
    const body = await readJson(ctx.req)
    const ops = Array.isArray(body.ops)
      ? body.ops as WorkflowPatchOperation[]
      : []
    if (typeof body.baseRevision !== 'number') {
      throw new HttpError(400, 'baseRevision is required')
    }
    sendJson(ctx.res, 200, {
      workflow: await workflows.patch({
        id: workflowId,
        baseRevision: body.baseRevision,
        ops,
      }),
      appliedOps: ops.length,
    })
    return true
  }
  if (ctx.req.method === 'DELETE') {
    await workflows.delete(workflowId)
    sendJson(ctx.res, 200, { ok: true })
    return true
  }
  return false
}

async function requireWorkflow(workflows: WorkflowApi, id: string) {
  const workflow = await workflows.get(id)
  if (!workflow) throw new HttpError(404, `workflow not found: ${id}`)
  return workflow
}
