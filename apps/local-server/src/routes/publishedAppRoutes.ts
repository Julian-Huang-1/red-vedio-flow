import { createHash, randomBytes, randomUUID } from 'node:crypto'
import type { AppRelease, PublishedApp, RuntimeSession } from '@red-video-flow/postgres-backend'
import type { LocalServerRuntime } from '../runtime.js'
import { requireRequestUser } from '../auth.js'
import { HttpError, readJson, sendJson, type RequestContext } from '../http.js'
import {
  createWorkflowAppRunFromInputs,
  type AppRun,
} from './workflowAppRoutes.js'

const MAX_HTML_BYTES = 300 * 1024
const RUNTIME_SESSION_TTL_MS = 30 * 60_000

export async function handlePublishedAppRoutes(runtime: LocalServerRuntime, ctx: RequestContext) {
  if (isRuntimeHost(runtime, ctx)) {
    if (await handleRuntimePage(runtime, ctx)) return true
    return handleRuntimeApi(runtime, ctx)
  }
  if (await handleRuntimePage(runtime, ctx)) return true
  if (await handleRuntimeApi(runtime, ctx)) return true
  return handleManagementApi(runtime, ctx)
}

async function handleManagementApi(runtime: LocalServerRuntime, ctx: RequestContext) {
  const { req, res, pathname } = ctx
  if (pathname === '/api/apps' && req.method === 'GET') {
    const user = await requireRequestUser(runtime, req)
    const apps = await runtime.publishedApps.listApps()
    sendJson(res, 200, { apps: apps.map((app) => publicApp(app, user.id)) })
    return true
  }

  const appMatch = pathname.match(/^\/api\/apps\/([^/]+)$/)
  if (appMatch && req.method === 'DELETE') {
    const user = await requireRequestUser(runtime, req)
    const app = await requireOwnedApp(runtime, decodeURIComponent(appMatch[1]), user.id)
    await runtime.publishedApps.deleteApp(app.id)
    res.writeHead(204)
    res.end()
    return true
  }
  if (pathname === '/api/apps' && req.method === 'POST') {
    const user = await requireRequestUser(runtime, req)
    const body = await readJson(req)
    const now = Date.now()
    const app: PublishedApp = {
      id: `app-${randomUUID()}`,
      ownerId: user.id,
      title: stringValue(body.title) ?? '未命名应用',
      createdAt: now,
      updatedAt: now,
    }
    await runtime.publishedApps.createApp(app)
    sendJson(res, 201, { app })
    return true
  }

  const releaseListMatch = pathname.match(/^\/api\/apps\/([^/]+)\/releases$/)
  if (releaseListMatch) {
    const appId = decodeURIComponent(releaseListMatch[1])
    const user = await requireRequestUser(runtime, req)
    const app = await requireOwnedApp(runtime, appId, user.id)
    if (req.method === 'GET') {
      const releases = await runtime.publishedApps.listReleases(appId)
      sendJson(res, 200, { app, releases: releases.map(publicRelease) })
      return true
    }
    if (req.method === 'POST') {
      const body = await readJson(req, MAX_HTML_BYTES + 16 * 1024)
      const html = stringValue(body.html)
      if (!html) throw new HttpError(400, 'html is required')
      if (Buffer.byteLength(html, 'utf8') > MAX_HTML_BYTES) {
        throw new HttpError(413, 'HTML artifact exceeds the 300KB limit')
      }
      const releases = await runtime.publishedApps.listReleases(appId)
      const now = Date.now()
      const release: AppRelease = {
        id: `release-${randomUUID()}`,
        appId,
        version: (releases[0]?.version ?? 0) + 1,
        html,
        contentHash: createHash('sha256').update(html).digest('hex'),
        createdBy: user.id,
        createdAt: now,
      }
      await runtime.publishedApps.createRelease(release)
      await runtime.publishedApps.saveApp({
        ...app,
        title: stringValue(body.title) ?? app.title,
        currentReleaseId: release.id,
        updatedAt: now,
      })
      sendJson(res, 201, { release: publicRelease(release) })
      return true
    }
  }

  const previewMatch = pathname.match(/^\/api\/apps\/([^/]+)\/preview$/)
  if (previewMatch && req.method === 'GET') {
    await requireRequestUser(runtime, req)
    const app = await requireApp(runtime, decodeURIComponent(previewMatch[1]))
    if (!app.currentReleaseId) throw new HttpError(404, 'app has no active release')
    const release = await runtime.publishedApps.getRelease(app.currentReleaseId)
    if (!release || release.appId !== app.id) throw new HttpError(404, 'release not found')
    res.writeHead(200, previewHeaders())
    res.end(release.html)
    return true
  }

  const activateMatch = pathname.match(/^\/api\/apps\/([^/]+)\/releases\/([^/]+)\/activate$/)
  if (activateMatch && req.method === 'POST') {
    const user = await requireRequestUser(runtime, req)
    const appId = decodeURIComponent(activateMatch[1])
    const app = await requireOwnedApp(runtime, appId, user.id)
    const release = await runtime.publishedApps.getRelease(decodeURIComponent(activateMatch[2]))
    if (!release || release.appId !== appId) throw new HttpError(404, 'release not found')
    await runtime.publishedApps.saveApp({ ...app, currentReleaseId: release.id, updatedAt: Date.now() })
    sendJson(res, 200, { release: publicRelease(release) })
    return true
  }

  const capabilityMatch = pathname.match(/^\/api\/apps\/([^/]+)\/capabilities(?:\/([^/]+))?$/)
  if (capabilityMatch) {
    const user = await requireRequestUser(runtime, req)
    const appId = decodeURIComponent(capabilityMatch[1])
    await requireOwnedApp(runtime, appId, user.id)
    const encodedKey = capabilityMatch[2]
    if (!encodedKey && req.method === 'GET') {
      sendJson(res, 200, { capabilities: await runtime.publishedApps.listCapabilities(appId) })
      return true
    }
    if (!encodedKey) return false
    const key = decodeURIComponent(encodedKey)
    requireCapabilityKey(key)
    if (req.method === 'PUT') {
      const body = await readJson(req)
      const workflowId = stringValue(body.workflowId)
      if (!workflowId) throw new HttpError(400, 'workflowId is required')
      const workflow = runtime.backend.workflows.get(workflowId)
      if (!workflow) throw new HttpError(404, 'workflow not found')
      const requestedRevision = typeof body.workflowRevision === 'number'
        ? body.workflowRevision
        : workflow.revision
      if (requestedRevision !== workflow.revision) {
        throw new HttpError(409, 'workflow revision does not match current revision')
      }
      const subgraphId = stringValue(body.subgraphId)
      if (subgraphId && !workflow.graph.subgraphs?.some((item) => item.id === subgraphId)) {
        throw new HttpError(404, 'subgraph not found')
      }
      const now = Date.now()
      const existing = await runtime.publishedApps.getCapability(appId, key)
      const capability = await runtime.publishedApps.saveCapability({
        id: existing?.id ?? `capability-${randomUUID()}`,
        appId,
        key,
        workflowId,
        workflowRevision: requestedRevision,
        subgraphId,
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
      })
      sendJson(res, 200, { capability })
      return true
    }
    if (req.method === 'DELETE') {
      const deleted = await runtime.publishedApps.deleteCapability(appId, key)
      if (!deleted) throw new HttpError(404, 'capability not found')
      res.writeHead(204)
      res.end()
      return true
    }
  }

  const sessionMatch = pathname.match(/^\/api\/apps\/([^/]+)\/runtime-sessions$/)
  if (sessionMatch && req.method === 'POST') {
    const user = await requireRequestUser(runtime, req)
    const appId = decodeURIComponent(sessionMatch[1])
    const app = await requireApp(runtime, appId)
    if (!app.currentReleaseId) throw new HttpError(409, 'app has no active release')
    const token = `rt_${randomBytes(32).toString('base64url')}`
    const now = Date.now()
    const session: RuntimeSession = {
      id: `runtime-session-${randomUUID()}`,
      tokenHash: hashToken(token),
      userId: user.id,
      appId,
      releaseId: app.currentReleaseId,
      expiresAt: now + RUNTIME_SESSION_TTL_MS,
      createdAt: now,
    }
    await runtime.publishedApps.createRuntimeSession(session)
    const runtimePath = runtime.config.runtimePublicOrigin
      ? `${runtime.config.runtimePublicOrigin}/apps/${encodeURIComponent(appId)}`
      : `${requestOrigin(ctx)}/runtime/apps/${encodeURIComponent(appId)}`
    sendJson(res, 201, {
      runtimeUrl: `${runtimePath}?token=${encodeURIComponent(token)}`,
      expiresAt: session.expiresAt,
    })
    return true
  }

  return false
}

async function handleRuntimePage(runtime: LocalServerRuntime, ctx: RequestContext) {
  const runtimePath = ctx.pathname.match(/^\/runtime\/apps\/([^/]+)$/)
  const hostedPath = isRuntimeHost(runtime, ctx) && ctx.pathname.match(/^\/apps\/([^/]+)$/)
  const match = runtimePath || hostedPath
  if (!match || ctx.req.method !== 'GET') return false
  await serveRuntimePage(runtime, ctx, decodeURIComponent(match[1]))
  return true
}

async function serveRuntimePage(runtime: LocalServerRuntime, ctx: RequestContext, appId: string) {
  try {
    const token = ctx.url.searchParams.get('token') ?? ''
    const session = await requireRuntimeSession(runtime, token, appId)
    const release = await runtime.publishedApps.getRelease(session.releaseId)
    if (!release || release.appId !== appId) throw new HttpError(404, 'release not found')
    const html = injectRuntimeConfig(release.html, appId, token)
    ctx.res.writeHead(200, runtimeHeaders(runtime))
    ctx.res.end(html)
  } catch (error) {
    const status = error instanceof HttpError ? error.status : 500
    ctx.res.writeHead(status, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' })
    ctx.res.end(error instanceof Error ? error.message : String(error))
  }
}

async function handleRuntimeApi(runtime: LocalServerRuntime, ctx: RequestContext) {
  const startMatch = ctx.pathname.match(
    /^\/api\/runtime\/apps\/([^/]+)\/capabilities\/([^/]+)\/runs$/,
  )
  if (startMatch && ctx.req.method === 'POST') {
    const appId = decodeURIComponent(startMatch[1])
    const key = decodeURIComponent(startMatch[2])
    const session = await requireRuntimeSession(runtime, bearerToken(ctx), appId)
    const capability = await runtime.publishedApps.getCapability(appId, key)
    if (!capability) throw new HttpError(404, 'capability not found')
    const body = await readJson(ctx.req)
    const inputs = isRecord(body.inputs) ? body.inputs : {}
    const result = await createWorkflowAppRunFromInputs(
      runtime,
      capability.workflowId,
      inputs,
      session.userId,
      capability.workflowRevision,
      capability.subgraphId,
    )
    if (!result.ok) {
      sendJson(ctx.res, result.error.error === 'workflow_revision_conflict' ? 409 : 422, result.error)
      return true
    }
    await runtime.publishedApps.bindRuntimeRun(result.run.id, session.id, appId, Date.now())
    sendJson(ctx.res, 202, { run: runtimePublicRun(result.run) })
    return true
  }

  const runMatch = ctx.pathname.match(/^\/api\/runtime\/apps\/([^/]+)\/runs\/([^/]+)(?:\/(cancel))?$/)
  if (runMatch && (ctx.req.method === 'GET' || (ctx.req.method === 'POST' && runMatch[3] === 'cancel'))) {
    const appId = decodeURIComponent(runMatch[1])
    const runId = decodeURIComponent(runMatch[2])
    const session = await requireRuntimeSession(runtime, bearerToken(ctx), appId)
    const binding = await runtime.publishedApps.getRuntimeRunBinding(runId)
    if (!binding || binding.appId !== appId || binding.sessionId !== session.id) {
      throw new HttpError(404, 'run not found')
    }
    const run = runtime.postgresInfrastructure
      ? await runtime.postgresInfrastructure.postgresWorkflowAppRuns.get<AppRun>(runId)
      : runtime.backend.workflowAppRuns.get<AppRun>(runId)
    if (!run) throw new HttpError(404, 'run not found')
    if (ctx.req.method === 'POST' && (run.status === 'queued' || run.status === 'running')) {
      run.cancelled = true
      run.status = 'cancelled'
      run.updatedAt = Date.now()
      if (runtime.postgresInfrastructure) {
        await runtime.postgresInfrastructure.postgresWorkflowAppRuns.save(run)
      } else {
        runtime.backend.workflowAppRuns.save(run)
      }
    }
    sendJson(ctx.res, 200, { run: runtimePublicRun(run) })
    return true
  }
  return false
}

async function requireOwnedApp(runtime: LocalServerRuntime, appId: string, userId: string) {
  const app = await requireApp(runtime, appId)
  if (app.ownerId !== userId) throw new HttpError(403, 'app access denied')
  return app
}

async function requireApp(runtime: LocalServerRuntime, appId: string) {
  const app = await runtime.publishedApps.getApp(appId)
  if (!app) throw new HttpError(404, 'app not found')
  return app
}

function publicApp(app: PublishedApp, userId: string) {
  const { ownerId: _, ...safe } = app
  return { ...safe, isOwner: app.ownerId === userId }
}

async function requireRuntimeSession(runtime: LocalServerRuntime, token: string, appId: string) {
  if (!token) throw new HttpError(401, 'runtime token is required')
  const session = await runtime.publishedApps.getRuntimeSessionByTokenHash(hashToken(token))
  if (!session || session.appId !== appId || session.revokedAt || session.expiresAt <= Date.now()) {
    throw new HttpError(401, 'runtime token is invalid or expired')
  }
  return session
}

function injectRuntimeConfig(html: string, appId: string, token: string) {
  const script = `<script>window.RUNTIME_CONFIG=${safeJson({ appId, token })};console.info('[RuntimeConfig] appId:',window.RUNTIME_CONFIG.appId);console.info('[RuntimeConfig] token:',window.RUNTIME_CONFIG.token);</script>`
  return /<head(?:\s[^>]*)?>/i.test(html)
    ? html.replace(/<head(\s[^>]*)?>/i, (head) => `${head}${script}`)
    : `${script}${html}`
}

function runtimeHeaders(runtime: LocalServerRuntime) {
  const frameAncestor = runtime.config.mainAppOrigin ?? "'self'"
  return {
    'Content-Type': 'text/html; charset=utf-8',
    'Cache-Control': 'no-store',
    'Referrer-Policy': 'no-referrer',
    'X-Content-Type-Options': 'nosniff',
    'Content-Security-Policy': `frame-ancestors ${frameAncestor}`,
  }
}

function previewHeaders() {
  return {
    'Content-Type': 'text/html; charset=utf-8',
    'Cache-Control': 'private, max-age=60',
    'Referrer-Policy': 'no-referrer',
    'X-Content-Type-Options': 'nosniff',
    'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; img-src https: data: blob:; font-src https: data:; media-src https: data:; frame-ancestors 'self'",
  }
}

function isRuntimeHost(runtime: LocalServerRuntime, ctx: RequestContext) {
  if (!runtime.config.runtimeHost) return false
  return (ctx.req.headers.host?.split(':')[0] ?? '').toLowerCase() === runtime.config.runtimeHost
}

function bearerToken(ctx: RequestContext) {
  const header = ctx.req.headers.authorization
  if (!header?.startsWith('Bearer ')) throw new HttpError(401, 'runtime token is required')
  return header.slice('Bearer '.length).trim()
}

function requestOrigin(ctx: RequestContext) {
  const forwardedProto = String(ctx.req.headers['x-forwarded-proto'] ?? '').split(',')[0].trim()
  const protocol = forwardedProto || 'http'
  return `${protocol}://${ctx.req.headers.host ?? '127.0.0.1'}`
}

function publicRelease(release: AppRelease) {
  const { html: _, ...safe } = release
  return safe
}

function runtimePublicRun(run: AppRun) {
  return {
    id: run.id,
    status: run.status,
    outputs: run.outputs,
    error: run.error,
    events: run.events,
    createdAt: run.createdAt,
    updatedAt: run.updatedAt,
  }
}

function requireCapabilityKey(key: string) {
  if (!/^[a-z][a-z0-9-]{0,63}$/.test(key)) {
    throw new HttpError(400, 'capability key must use lowercase letters, numbers, and hyphens')
  }
}

function hashToken(token: string) {
  return createHash('sha256').update(token).digest('hex')
}

function safeJson(value: unknown) {
  return JSON.stringify(value).replace(/</g, '\\u003c')
}

function stringValue(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}
