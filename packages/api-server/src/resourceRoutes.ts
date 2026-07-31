import type {
  Resource,
  ResourceBinding,
  ResourceKind,
  ResourceRelation,
  ResourceSource,
} from '@red-video-flow/workflow-core'
import {
  HttpError,
  optionalString,
  pathParts,
  readJson,
  sendJson,
  type RequestContext,
} from './http.js'

type Awaitable<T> = T | Promise<T>

export type ResourceQuery = {
  workspaceId?: string
  kind?: ResourceKind
  source?: ResourceSource
  query?: string
}

export type CreateTextResourceInput = {
  workspaceId: string
  name: string
  text: string
  source: ResourceSource
}

export type CreateResourceBindingInput = {
  resourceId: string
  workflowId: string
  nodeId?: string
  runId?: string
  resultId?: string
  relation: ResourceRelation
}

export type ResourceApi = {
  list(input: ResourceQuery): Awaitable<Resource[]>
  get(id: string): Awaitable<Resource | undefined>
  createText(input: CreateTextResourceInput): Awaitable<Resource>
  rename(resource: Resource, name: string): Awaitable<Resource | undefined>
  softDelete(id: string): Awaitable<unknown>
  bindings(resourceId: string): Awaitable<ResourceBinding[]>
  bind(input: CreateResourceBindingInput): Awaitable<ResourceBinding>
}

export async function handleResourceRoutes(
  ctx: RequestContext,
  resources: ResourceApi,
) {
  if (ctx.pathname === '/api/resources' && ctx.req.method === 'GET') {
    sendJson(ctx.res, 200, {
      resources: await resources.list({
        workspaceId: ctx.url.searchParams.get('workspaceId')?.trim(),
        kind: resourceKind(ctx.url.searchParams.get('kind')),
        source: resourceSource(ctx.url.searchParams.get('source')),
        query: ctx.url.searchParams.get('q') ?? undefined,
      }),
    })
    return true
  }
  if (ctx.pathname === '/api/resources/text' && ctx.req.method === 'POST') {
    const body = await readJson(ctx.req)
    if (typeof body.workspaceId !== 'string' || typeof body.text !== 'string') {
      throw new HttpError(400, 'workspaceId and text are required')
    }
    const resource = await resources.createText({
      workspaceId: body.workspaceId,
      name: typeof body.name === 'string' ? body.name : '文本素材',
      text: body.text,
      source: resourceSource(body.source) ?? 'imported',
    })
    sendJson(ctx.res, 201, { resource })
    return true
  }

  const route = pathParts(ctx.pathname, '/api/resources/')
  if (!route?.length) return false
  const resource = await resources.get(route[0])
  if (!resource) throw new HttpError(404, 'resource not found')
  if (route.length === 1 && ctx.req.method === 'GET') {
    sendJson(ctx.res, 200, { resource })
    return true
  }
  if (route.length === 1 && ctx.req.method === 'PATCH') {
    const body = await readJson(ctx.req)
    if (typeof body.name !== 'string' || !body.name.trim()) {
      throw new HttpError(400, 'name is required')
    }
    sendJson(ctx.res, 200, {
      resource: await resources.rename(resource, body.name.trim()),
    })
    return true
  }
  if (route.length === 1 && ctx.req.method === 'DELETE') {
    await resources.softDelete(resource.id)
    sendJson(ctx.res, 200, { ok: true })
    return true
  }
  if (route.length === 2 && route[1] === 'usages' && ctx.req.method === 'GET') {
    sendJson(ctx.res, 200, {
      bindings: await resources.bindings(resource.id),
    })
    return true
  }
  if (route.length === 2 && route[1] === 'bindings' && ctx.req.method === 'POST') {
    const body = await readJson(ctx.req)
    const relation = resourceRelation(body.relation)
    if (typeof body.workflowId !== 'string' || !relation) {
      throw new HttpError(400, 'workflowId and valid relation are required')
    }
    sendJson(ctx.res, 201, {
      binding: await resources.bind({
        resourceId: resource.id,
        workflowId: body.workflowId,
        nodeId: optionalString(body.nodeId),
        runId: optionalString(body.runId),
        resultId: optionalString(body.resultId),
        relation,
      }),
    })
    return true
  }
  return false
}

export function resourceKind(value: unknown): ResourceKind | undefined {
  return value === 'text' || value === 'image' || value === 'video' || value === 'file'
    ? value
    : undefined
}

export function resourceSource(value: unknown): ResourceSource | undefined {
  return value === 'upload' || value === 'generated' || value === 'imported'
    ? value
    : undefined
}

export function resourceRelation(value: unknown): ResourceRelation | undefined {
  return value === 'generated'
    || value === 'attachment'
    || value === 'node-content'
    || value === 'upstream-input'
    || value === 'last-frame'
    || value === 'cover'
    ? value
    : undefined
}
