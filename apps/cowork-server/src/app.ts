import { randomUUID } from 'node:crypto'
import { createReadStream, existsSync, statSync } from 'node:fs'
import { extname, join, normalize } from 'node:path'
import {
  handleModelCredentialRoute,
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
      if (ctx.pathname.startsWith('/api/')) {
        const user = await requireUser(runtime, req)
        if (
          await handleWorkflows(runtime, ctx, user.id)
          || await handlePiAgentRoutes(runtime, ctx, user.id)
          || await handleRuns(runtime, ctx, user.id)
          || await handleCredentials(runtime, ctx, user.id)
          || await handleBlobs(runtime, ctx, user.id)
          || await handleResources(runtime, ctx)
          || await handleChats(runtime, ctx, user.id)
          || await handleAppRuns(runtime, ctx, user.id)
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
    list: () => workflows.list(),
    get: (id) => workflows.get(id),
    create: (input) => workflows.create(input),
    save: (input) => workflows.save(input),
    patch: (input) => workflows.patch(input),
    delete: (id) => workflows.delete(id),
  }
  void userId
  return handleSharedWorkflowRoutes(ctx, api)
}

async function handleRuns(runtime: CoworkRuntime, ctx: RequestContext, userId: string) {
  return handleDurableNodeRunRoutes(runtime, ctx, userId)
}

async function handleCredentials(runtime: CoworkRuntime, ctx: RequestContext, userId: string) {
  return handleModelCredentialRoute(ctx, {
    userId,
    credentials: runtime.infrastructure.credentials,
  })
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
    saveResource: (resource, blobId) => (
      runtime.infrastructure.postgresResources.save(resource, blobId)
    ),
  })
}

async function handleResources(runtime: CoworkRuntime, ctx: RequestContext) {
  const repository = runtime.infrastructure.postgresResources
  const api: ResourceApi = {
    list: (input) => repository.list(input),
    get: (id) => repository.get(id),
    createText: async (input) => {
      const now = Date.now()
      const resource = {
        id: randomUUID(),
        ...input,
        kind: 'text' as const,
        createdAt: now,
        updatedAt: now,
      }
      await repository.save(resource)
      return resource
    },
    rename: async (resource, name) => {
      const updated = { ...resource, name, updatedAt: Date.now() }
      await repository.save(updated)
      return updated
    },
    softDelete: (id) => repository.softDelete(id),
    bindings: (resourceId) => repository.bindings(resourceId),
    bind: (input) => repository.bind(input),
  }
  return handleSharedResourceRoutes(ctx, api)
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
