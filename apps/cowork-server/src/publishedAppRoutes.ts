import { createHash, randomBytes, randomUUID } from 'node:crypto'
import {
  createAppRun,
  HttpError,
  isRecord,
  readJson,
  sendJson,
  type CoworkAppRun,
  type RequestContext,
} from '@red-video-flow/api-server'
import { validateWorkflowForRun } from '@red-video-flow/workflow-core'
import type { AppRelease, PublishedApp, RuntimeSession } from '@red-video-flow/postgres-backend'
import type { CoworkRuntime } from './runtime.js'

const MAX_HTML_BYTES = 300 * 1024
const RUNTIME_SESSION_TTL_MS = 30 * 60_000

export async function handlePublishedAppManagementRoutes(
  runtime: CoworkRuntime,
  ctx: RequestContext,
  userId: string,
) {
  const repository = runtime.infrastructure.publishedApps
  const { req, res, pathname } = ctx

  if (pathname === '/api/apps' && req.method === 'GET') {
    sendJson(res, 200, { apps: await repository.listApps(userId) })
    return true
  }
  if (pathname === '/api/apps' && req.method === 'POST') {
    const body = await readJson(req)
    const now = Date.now()
    const app: PublishedApp = {
      id: `app-${randomUUID()}`,
      ownerId: userId,
      title: stringValue(body.title) ?? '未命名应用',
      createdAt: now,
      updatedAt: now,
    }
    await repository.createApp(app)
    sendJson(res, 201, { app })
    return true
  }

  const releasesMatch = pathname.match(/^\/api\/apps\/([^/]+)\/releases$/)
  if (releasesMatch) {
    const appId = decodeURIComponent(releasesMatch[1])
    const app = await requireOwnedApp(runtime, appId, userId)
    if (req.method === 'GET') {
      const releases = await repository.listReleases(appId)
      sendJson(res, 200, { app, releases: releases.map(publicRelease) })
      return true
    }
    if (req.method === 'POST') {
      const body = await readJson(req, MAX_HTML_BYTES + 16 * 1024)
      const html = stringValue(body.html)
      if (!html) throw new HttpError(400, 'html is required')
      if (Buffer.byteLength(html) > MAX_HTML_BYTES) {
        throw new HttpError(413, 'HTML artifact exceeds the 300KB limit')
      }
      const releases = await repository.listReleases(appId)
      const now = Date.now()
      const release: AppRelease = {
        id: `release-${randomUUID()}`,
        appId,
        version: (releases[0]?.version ?? 0) + 1,
        html,
        contentHash: createHash('sha256').update(html).digest('hex'),
        createdBy: userId,
        createdAt: now,
      }
      await repository.createRelease(release)
      await repository.saveApp({
        ...app,
        title: stringValue(body.title) ?? app.title,
        currentReleaseId: release.id,
        updatedAt: now,
      })
      sendJson(res, 201, { release: publicRelease(release) })
      return true
    }
  }

  const capabilityMatch = pathname.match(/^\/api\/apps\/([^/]+)\/capabilities\/([^/]+)$/)
  if (capabilityMatch && req.method === 'PUT') {
    const appId = decodeURIComponent(capabilityMatch[1])
    const key = decodeURIComponent(capabilityMatch[2])
    requireCapabilityKey(key)
    await requireOwnedApp(runtime, appId, userId)
    const body = await readJson(req)
    const workflowId = stringValue(body.workflowId)
    if (!workflowId) throw new HttpError(400, 'workflowId is required')
    const workflow = await runtime.infrastructure.postgresWorkflows.get(workflowId)
    if (!workflow) throw new HttpError(404, 'workflow not found')
    const requestedRevision = typeof body.workflowRevision === 'number'
      ? body.workflowRevision
      : workflow.revision
    if (requestedRevision !== workflow.revision) {
      throw new HttpError(409, 'workflow revision does not match current revision')
    }
    const now = Date.now()
    const existing = await repository.getCapability(appId, key)
    const capability = await repository.saveCapability({
      id: existing?.id ?? `capability-${randomUUID()}`,
      appId,
      key,
      workflowId,
      workflowRevision: requestedRevision,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    })
    sendJson(res, 200, { capability })
    return true
  }

  const sessionMatch = pathname.match(/^\/api\/apps\/([^/]+)\/runtime-sessions$/)
  if (sessionMatch && req.method === 'POST') {
    const appId = decodeURIComponent(sessionMatch[1])
    const app = await requireOwnedApp(runtime, appId, userId)
    if (!app.currentReleaseId) throw new HttpError(409, 'app has no active release')
    const token = `rt_${randomBytes(32).toString('base64url')}`
    const now = Date.now()
    const session: RuntimeSession = {
      id: `runtime-session-${randomUUID()}`,
      tokenHash: hashToken(token),
      userId,
      appId,
      releaseId: app.currentReleaseId,
      expiresAt: now + RUNTIME_SESSION_TTL_MS,
      createdAt: now,
    }
    await repository.createRuntimeSession(session)
    const base = runtime.config.runtimePublicOrigin
      ? `${runtime.config.runtimePublicOrigin}/apps/${encodeURIComponent(appId)}`
      : `${requestOrigin(ctx)}/runtime/apps/${encodeURIComponent(appId)}`
    sendJson(res, 201, {
      runtimeUrl: `${base}?token=${encodeURIComponent(token)}`,
      expiresAt: session.expiresAt,
    })
    return true
  }
  return false
}

export async function handlePublishedAppRuntimeRoutes(runtime: CoworkRuntime, ctx: RequestContext) {
  const pageMatch = ctx.pathname.match(/^\/runtime\/apps\/([^/]+)$/)
    || (isRuntimeHost(runtime, ctx) && ctx.pathname.match(/^\/apps\/([^/]+)$/))
  if (pageMatch && ctx.req.method === 'GET') {
    const appId = decodeURIComponent(pageMatch[1])
    const token = ctx.url.searchParams.get('token') ?? ''
    const session = await requireRuntimeSession(runtime, token, appId)
    const release = await runtime.infrastructure.publishedApps.getRelease(session.releaseId)
    if (!release || release.appId !== appId) throw new HttpError(404, 'release not found')
    ctx.res.writeHead(200, runtimeHeaders(runtime))
    ctx.res.end(injectRuntimeConfig(release.html, appId, token))
    return true
  }

  const startMatch = ctx.pathname.match(
    /^\/api\/runtime\/apps\/([^/]+)\/capabilities\/([^/]+)\/runs$/,
  )
  if (startMatch && ctx.req.method === 'POST') {
    const appId = decodeURIComponent(startMatch[1])
    const session = await requireRuntimeSession(runtime, bearerToken(ctx), appId)
    const capability = await runtime.infrastructure.publishedApps.getCapability(
      appId,
      decodeURIComponent(startMatch[2]),
    )
    if (!capability) throw new HttpError(404, 'capability not found')
    const workflow = await runtime.infrastructure.postgresWorkflows.get(capability.workflowId)
    if (!workflow) throw new HttpError(404, 'workflow not found')
    if (workflow.revision !== capability.workflowRevision) {
      throw new HttpError(409, 'bound workflow revision is no longer available')
    }
    const body = await readJson(ctx.req)
    const inputs = isRecord(body.inputs) ? body.inputs : {}
    const validation = validateWorkflowForRun(workflow, inputs)
    if (!validation.valid) {
      sendJson(ctx.res, 422, {
        error: 'workflow_validation_failed',
        message: '工作流运行前校验未通过',
        issues: validation.issues,
      })
      return true
    }
    const run = createAppRun(workflow, session.userId, inputs)
    await runtime.infrastructure.postgresWorkflowAppRuns.save(run)
    await runtime.infrastructure.publishedApps.bindRuntimeRun(run.id, session.id, appId, Date.now())
    await runtime.infrastructure.jobs.enqueue({
      id: `schedule-workflow:${run.id}`,
      type: 'schedule-workflow',
      payload: { runId: run.id },
      maxAttempts: 1,
    })
    sendJson(ctx.res, 202, { run: runtimePublicRun(run) })
    return true
  }

  const runMatch = ctx.pathname.match(/^\/api\/runtime\/apps\/([^/]+)\/runs\/([^/]+)(?:\/(cancel))?$/)
  if (runMatch && (ctx.req.method === 'GET' || (ctx.req.method === 'POST' && runMatch[3] === 'cancel'))) {
    const appId = decodeURIComponent(runMatch[1])
    const runId = decodeURIComponent(runMatch[2])
    const session = await requireRuntimeSession(runtime, bearerToken(ctx), appId)
    const binding = await runtime.infrastructure.publishedApps.getRuntimeRunBinding(runId)
    if (!binding || binding.appId !== appId || binding.sessionId !== session.id) {
      throw new HttpError(404, 'run not found')
    }
    const run = await runtime.infrastructure.postgresWorkflowAppRuns.get<CoworkAppRun>(runId)
    if (!run) throw new HttpError(404, 'run not found')
    if (ctx.req.method === 'POST' && (run.status === 'queued' || run.status === 'running')) {
      run.cancelled = true
      run.status = 'cancelled'
      run.updatedAt = Date.now()
      await runtime.infrastructure.postgresWorkflowAppRuns.save(run)
    }
    sendJson(ctx.res, 200, { run: runtimePublicRun(run) })
    return true
  }
  return false
}

export function isRuntimeHost(runtime: CoworkRuntime, ctx: RequestContext) {
  return Boolean(runtime.config.runtimeHost)
    && (ctx.req.headers.host?.split(':')[0] ?? '').toLowerCase() === runtime.config.runtimeHost
}

async function requireOwnedApp(runtime: CoworkRuntime, appId: string, userId: string) {
  const app = await runtime.infrastructure.publishedApps.getApp(appId)
  if (!app) throw new HttpError(404, 'app not found')
  if (app.ownerId !== userId) throw new HttpError(403, 'app access denied')
  return app
}

async function requireRuntimeSession(runtime: CoworkRuntime, token: string, appId: string) {
  if (!token) throw new HttpError(401, 'runtime token is required')
  const session = await runtime.infrastructure.publishedApps.getRuntimeSessionByTokenHash(hashToken(token))
  if (!session || session.appId !== appId || session.revokedAt || session.expiresAt <= Date.now()) {
    throw new HttpError(401, 'runtime token is invalid or expired')
  }
  return session
}

function runtimePublicRun(run: CoworkAppRun) {
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

function injectRuntimeConfig(html: string, appId: string, token: string) {
  const script = `<script>window.RUNTIME_CONFIG=${safeJson({ appId, token })};</script>`
  return /<head(?:\s[^>]*)?>/i.test(html)
    ? html.replace(/<head(\s[^>]*)?>/i, (head) => `${head}${script}`)
    : `${script}${html}`
}

function runtimeHeaders(runtime: CoworkRuntime) {
  return {
    'Content-Type': 'text/html; charset=utf-8',
    'Cache-Control': 'no-store',
    'Referrer-Policy': 'no-referrer',
    'X-Content-Type-Options': 'nosniff',
    'Content-Security-Policy': `frame-ancestors ${runtime.config.mainAppOrigin ?? "'self'"}`,
  }
}

function bearerToken(ctx: RequestContext) {
  const header = ctx.req.headers.authorization
  if (!header?.startsWith('Bearer ')) throw new HttpError(401, 'runtime token is required')
  return header.slice(7).trim()
}

function requestOrigin(ctx: RequestContext) {
  const protocol = String(ctx.req.headers['x-forwarded-proto'] ?? '').split(',')[0].trim() || 'http'
  return `${protocol}://${ctx.req.headers.host ?? 'localhost'}`
}

function publicRelease(release: AppRelease) {
  const { html: _, ...safe } = release
  return safe
}

function requireCapabilityKey(key: string) {
  if (!/^[a-z][a-z0-9-]{0,63}$/.test(key)) {
    throw new HttpError(400, 'invalid capability key')
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
