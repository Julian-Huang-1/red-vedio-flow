import type {
  ResourceKind,
  ResourceRelation,
  ResourceSource,
} from '@red-video-flow/workflow-core'
import type { LocalServerRuntime } from '../runtime.js'
import {
  readJson,
  resourcePath,
  sendJson,
  type RequestContext,
} from '../http.js'

export async function handleResourceRoutes(runtime: LocalServerRuntime, ctx: RequestContext) {
  const { req, res, pathname, url } = ctx
  const { resources } = runtime.backend

  if (pathname === '/api/resources' && req.method === 'GET') {
    const workspaceId = url.searchParams.get('workspaceId')?.trim()
    if (!workspaceId) {
      sendJson(res, 400, { error: 'workspaceId is required' })
      return true
    }
    sendJson(res, 200, {
      resources: resources.list({
        workspaceId,
        kind: resourceKind(url.searchParams.get('kind')),
        source: resourceSource(url.searchParams.get('source')),
        query: url.searchParams.get('q') ?? undefined,
      }),
    })
    return true
  }

  if (pathname === '/api/resources/text' && req.method === 'POST') {
    const body = await readJson(req)
    if (typeof body.workspaceId !== 'string' || typeof body.text !== 'string') {
      sendJson(res, 400, { error: 'workspaceId and text are required' })
      return true
    }
    sendJson(res, 201, {
      resource: resources.createText({
        workspaceId: body.workspaceId,
        name: typeof body.name === 'string' ? body.name : '文本素材',
        text: body.text,
        source: resourceSource(body.source) ?? 'imported',
      }),
    })
    return true
  }

  const parts = resourcePath(pathname, '/api/resources/')
  if (!parts) return false
  const resource = resources.get(parts[0])
  if (!resource) {
    sendJson(res, 404, { error: 'resource not found' })
    return true
  }

  if (parts.length === 1 && req.method === 'GET') {
    sendJson(res, 200, { resource })
    return true
  }
  if (parts.length === 1 && req.method === 'PATCH') {
    const body = await readJson(req)
    if (typeof body.name !== 'string' || !body.name.trim()) {
      sendJson(res, 400, { error: 'name is required' })
      return true
    }
    sendJson(res, 200, { resource: resources.rename(resource.id, body.name) })
    return true
  }
  if (parts.length === 1 && req.method === 'DELETE') {
    resources.softDelete(resource.id)
    sendJson(res, 200, { ok: true })
    return true
  }
  if (parts.length === 2 && parts[1] === 'usages' && req.method === 'GET') {
    sendJson(res, 200, { bindings: resources.bindings(resource.id) })
    return true
  }
  if (parts.length === 2 && parts[1] === 'bindings' && req.method === 'POST') {
    const body = await readJson(req)
    const relation = resourceRelation(body.relation)
    if (typeof body.workflowId !== 'string' || !relation) {
      sendJson(res, 400, { error: 'workflowId and valid relation are required' })
      return true
    }
    sendJson(res, 201, {
      binding: resources.bind({
        resourceId: resource.id,
        workflowId: body.workflowId,
        nodeId: stringValue(body.nodeId),
        runId: stringValue(body.runId),
        resultId: stringValue(body.resultId),
        relation,
      }),
    })
    return true
  }
  return false
}

function resourceKind(value: unknown): ResourceKind | undefined {
  return value === 'text' || value === 'image' || value === 'video' || value === 'file'
    ? value
    : undefined
}

function resourceSource(value: unknown): ResourceSource | undefined {
  return value === 'upload' || value === 'generated' || value === 'imported'
    ? value
    : undefined
}

function resourceRelation(value: unknown): ResourceRelation | undefined {
  return value === 'generated'
    || value === 'attachment'
    || value === 'upstream-input'
    || value === 'last-frame'
    || value === 'cover'
    ? value
    : undefined
}

function stringValue(value: unknown) {
  return typeof value === 'string' ? value : undefined
}
