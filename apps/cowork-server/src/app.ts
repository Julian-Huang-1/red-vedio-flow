import { randomUUID } from 'node:crypto'
import { createReadStream, existsSync, statSync } from 'node:fs'
import { extname, join, normalize } from 'node:path'
import {
  handleBlobAssetRoutes,
  handleChatRoutes as handleSharedChatRoutes,
  handleDurableAppRunRoutes,
  handleDurableNodeRunRoutes,
  handleResourceRoutes as handleSharedResourceRoutes,
  handleWorkflowRoutes as handleSharedWorkflowRoutes,
  type ResourceApi,
  type ChatApi,
  type WorkflowApi,
} from '@red-video-flow/api-server'
import type { CoworkRuntime } from './runtime.js'
import { requireUser } from './auth.js'
import {
  HttpError,
  sendJson,
  type RequestContext,
} from './http.js'
import { coworkVisualModels } from './visualModels.js'
import { CoworkMediaUploader } from './mediaUploader.js'
import { handlePiAgentRoutes } from './piAgentRoutes.js'
import type { Resource } from '@red-video-flow/workflow-core'
import {
  handlePublishedAppManagementRoutes,
  handlePublishedAppRuntimeRoutes,
  isRuntimeHost,
} from './publishedAppRoutes.js'

const mediaUploader = new CoworkMediaUploader()

export function createRequestHandler(runtime: CoworkRuntime) {
  return async (req: RequestContext['req'], res: RequestContext['res']) => {
    try {
      const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`)
      const ctx = { req, res, url, pathname: url.pathname }
      if (req.method === 'GET' && ctx.pathname === '/health') {
        await runtime.database`SELECT 1`
        sendJson(res, 200, { ok: true })
        return
      }
      if (req.method === 'OPTIONS') {
        res.writeHead(204, {
          'Access-Control-Allow-Headers': 'content-type,range',
          'Access-Control-Allow-Methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
        })
        res.end()
        return
      }
      if (isRuntimeHost(runtime, ctx)) {
        if (await handlePublishedAppRuntimeRoutes(runtime, ctx)) return
        sendJson(res, 404, { error: 'not found' })
        return
      }
      if (await handlePublishedAppRuntimeRoutes(runtime, ctx)) return
      if (ctx.pathname.startsWith('/api/')) {
        const user = await requireUser(runtime, req)
        if (
          await handleWorkflows(runtime, ctx, user.id)
          || await handlePiAgentRoutes(runtime, ctx, user.id)
          || await handleRuns(runtime, ctx, user.id)
          || await handleBlobs(runtime, ctx, user.id)
          || await handleResources(runtime, ctx, user.id)
          || await handleChats(runtime, ctx, user.id)
          || await handleAppRuns(runtime, ctx, user.id)
          || await handlePublishedAppManagementRoutes(runtime, ctx, user.id)
          || handleDiscovery(runtime, ctx)
        ) return
        sendJson(res, 404, { error: 'not found' })
        return
      }
      if (await sendStatic(runtime, ctx)) return
      sendJson(res, 404, { error: 'not found' })
    } catch (error) {
      if (res.headersSent) {
        res.end()
        return
      }
      const status = error instanceof HttpError ? error.status : conflictStatus(error)
      sendJson(res, status, { error: error instanceof Error ? error.message : String(error) })
    }
  }
}

async function handleWorkflows(runtime: CoworkRuntime, ctx: RequestContext, userId: string) {
  const workflows = runtime.infrastructure.postgresWorkflows
  const api: WorkflowApi = {
    list: () => workflows.list(userId),
    get: (id) => workflows.get(id, userId),
    create: (input) => workflows.create(input, userId),
    save: (input) => workflows.save(input, userId),
    patch: (input) => workflows.patch(input, userId),
    delete: (id) => workflows.delete(id, userId),
  }
  return handleSharedWorkflowRoutes(ctx, api)
}

async function handleRuns(runtime: CoworkRuntime, ctx: RequestContext, userId: string) {
  return handleDurableNodeRunRoutes(runtime, ctx, userId)
}

async function handleBlobs(runtime: CoworkRuntime, ctx: RequestContext, userId: string) {
  return handleBlobAssetRoutes(ctx, {
    userId,
    blobs: runtime.infrastructure.blobs,
    publishAsset: ({ bytes, fileName, mimeType }) => mediaUploader.upload({
      bytes,
      fileName,
      mimeType,
      cookie: ctx.req.headers.cookie,
    }),
    requirePublishedAsset: ({ kind }) => kind === 'image' || kind === 'video' || kind === 'audio',
    onPublishAssetError: (error) => {
      console.error(
        '[asset upload] CDN publish failed:',
        error,
      )
    },
    saveResource: (resource, blobId) => (
      runtime.infrastructure.postgresResources.save(resource, blobId, userId)
    ),
  })
}

async function handleResources(runtime: CoworkRuntime, ctx: RequestContext, userId: string) {
  const repository = runtime.infrastructure.postgresResources
  const api: ResourceApi = {
    list: async (input) => {
      const resources = await repository.list({ ...input, ownerId: userId })
      return Promise.all(resources.map((resource) => (
        migrateLegacyMediaResource(runtime, resource, ctx.req.headers.cookie, userId)
      )))
    },
    get: async (id) => {
      const resource = await repository.get(id, userId)
      return resource
        ? migrateLegacyMediaResource(runtime, resource, ctx.req.headers.cookie, userId)
        : undefined
    },
    createText: async (input) => {
      const now = Date.now()
      const resource = {
        id: randomUUID(),
        ...input,
        kind: 'text' as const,
        createdAt: now,
        updatedAt: now,
      }
      await requireOwnedWorkflow(runtime, resource.workspaceId, userId)
      await repository.save(resource, undefined, userId)
      return resource
    },
    createWorkflow: async (input) => {
      const now = Date.now()
      const resource = {
        id: randomUUID(),
        ...input,
        kind: 'workflow' as const,
        createdAt: now,
        updatedAt: now,
      }
      await requireOwnedWorkflow(runtime, resource.workspaceId, userId)
      await repository.save(resource, undefined, userId)
      return resource
    },
    rename: async (resource, name) => {
      const updated = { ...resource, name, updatedAt: Date.now() }
      await repository.save(updated, undefined, userId)
      return updated
    },
    softDelete: (id) => repository.softDelete(id, userId),
    bindings: (resourceId) => repository.bindings(resourceId, userId),
    bind: async (input) => {
      if (!await repository.get(input.resourceId, userId)) throw new HttpError(404, 'resource not found')
      await requireOwnedWorkflow(runtime, input.workflowId, userId)
      return repository.bind(input)
    },
  }
  return handleSharedResourceRoutes(ctx, api)
}

async function requireOwnedWorkflow(runtime: CoworkRuntime, workflowId: string, userId: string) {
  const workflow = await runtime.infrastructure.postgresWorkflows.get(workflowId, userId)
  if (!workflow) throw new HttpError(404, 'workflow not found')
  return workflow
}

async function migrateLegacyMediaResource(
  runtime: CoworkRuntime,
  resource: Resource,
  cookie?: string,
  ownerId?: string,
) {
  if (
    (resource.kind !== 'image' && resource.kind !== 'video' && resource.kind !== 'audio')
    || isCompleteMediaUrl(resource.url)
  ) return resource

  const blobId = resource.url?.startsWith('/api/blobs/')
    ? decodeURIComponent(resource.url.slice('/api/blobs/'.length).split('/')[0])
    : await runtime.infrastructure.postgresResources.blobId(resource.id, ownerId)
  if (!blobId) return resource

  try {
    const blob = ownerId
      ? await runtime.infrastructure.blobs.statForOwner(blobId, ownerId)
      : await runtime.infrastructure.blobs.stat(blobId)
    if (!blob) throw new Error(`blob not found: ${blobId}`)
    const chunks: Buffer[] = []
    const body = ownerId
      ? await runtime.infrastructure.blobs.readForOwner(blobId, ownerId)
      : await runtime.infrastructure.blobs.read(blobId)
    for await (const chunk of body) {
      chunks.push(Buffer.from(chunk))
    }
    const publicUrl = await mediaUploader.upload({
      bytes: Buffer.concat(chunks),
      fileName: resource.fileName || resource.name || blob.fileName,
      mimeType: resource.mimeType || blob.contentType,
      cookie,
    })
    if (!publicUrl) throw new Error('CDN upload did not return a public URL')
    const migrated = { ...resource, url: publicUrl, updatedAt: Date.now() }
    await runtime.infrastructure.postgresResources.save(migrated, blobId, ownerId)
    return migrated
  } catch (error) {
    console.error(
      `[resource migration] failed to publish ${resource.id} to CDN:`,
      error,
    )
    return resource
  }
}

function isCompleteMediaUrl(value?: string) {
  if (!value) return false
  try {
    const url = new URL(value)
    return url.protocol === 'https:' || url.protocol === 'http:'
  } catch {
    return false
  }
}

async function handleChats(runtime: CoworkRuntime, ctx: RequestContext, userId: string) {
  const repository = runtime.infrastructure.postgresChats
  const chats: ChatApi = {
    list: (ownerId, query, workflowId) => repository.list(ownerId, query, workflowId),
    get: (ownerId, sessionId) => repository.get(ownerId, sessionId),
    saveSession: (session) => repository.saveSession(session),
    delete: (ownerId, sessionId) => repository.delete(ownerId, sessionId),
    saveMessage: (message) => repository.saveMessage(message),
  }
  return handleSharedChatRoutes(ctx, { userId, chats })
}

async function handleAppRuns(runtime: CoworkRuntime, ctx: RequestContext, userId: string) {
  return handleDurableAppRunRoutes(runtime, ctx, userId)
}

function handleDiscovery(runtime: CoworkRuntime, ctx: RequestContext) {
  if (ctx.req.method === 'GET' && ctx.pathname === '/api/visual-models') {
    sendJson(ctx.res, 200, coworkVisualModels)
    return true
  }
  if (ctx.req.method === 'GET' && ctx.pathname === '/api/providers') {
    sendJson(ctx.res, 200, { providers: runtime.providers.list() })
    return true
  }
  return false
}

async function sendStatic(runtime: CoworkRuntime, ctx: RequestContext) {
  if (ctx.req.method !== 'GET' && ctx.req.method !== 'HEAD') return false
  const requested = ctx.pathname === '/' ? 'index.html' : decodeURIComponent(ctx.pathname.slice(1))
  const safe = normalize(requested).replace(/^(\.\.(\/|\\|$))+/, '')
  let path = join(runtime.config.webDistDir, safe)
  if (!path.startsWith(runtime.config.webDistDir) || !existsSync(path) || statSync(path).isDirectory()) {
    path = join(runtime.config.webDistDir, 'index.html')
  }
  if (!existsSync(path)) return false
  ctx.res.writeHead(200, { 'Content-Type': contentType(path) })
  if (ctx.req.method === 'HEAD') ctx.res.end()
  else createReadStream(path).pipe(ctx.res)
  return true
}

function conflictStatus(error: unknown) {
  return error instanceof Error && /conflict/i.test(error.name + error.message) ? 409 : 500
}

function contentType(path: string) {
  return ({
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.webp': 'image/webp',
  } as Record<string, string>)[extname(path).toLowerCase()] ?? 'application/octet-stream'
}
