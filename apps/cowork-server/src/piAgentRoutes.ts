import {
  PiAgentSessionNotFoundError,
  type PiAgentAttachmentInput,
} from '@red-video-flow/local-server/pi-agent-service'
import type { CoworkRuntime } from './runtime.js'
import { HttpError, readJson, sendJson, type RequestContext } from './http.js'

export async function handlePiAgentRoutes(
  runtime: CoworkRuntime,
  ctx: RequestContext,
  userId: string,
) {
  const { req, res, pathname } = ctx
  if (!pathname.startsWith('/api/pi-agent/')) return false
  const service = await runtime.piAgents.forUser(userId)

  if (req.method === 'GET' && pathname === '/api/pi-agent/models') {
    sendJson(res, 200, { models: await service.listModels() })
    return true
  }
  if (pathname === '/api/pi-agent/sessions') {
    if (req.method === 'GET') {
      sendJson(res, 200, { sessions: await service.listSessions(ctx.url.searchParams.get('q') ?? undefined) })
      return true
    }
    if (req.method === 'POST') {
      const body = await readJson(req)
      sendJson(res, 201, { session: await service.createSession({
        id: typeof body.id === 'string' ? body.id : undefined,
        title: typeof body.title === 'string' ? body.title : undefined,
      }) })
      return true
    }
  }

  const sessionMatch = pathname.match(/^\/api\/pi-agent\/sessions\/([^/]+)$/)
  if (sessionMatch) {
    const id = decodeURIComponent(sessionMatch[1])
    try {
      if (req.method === 'GET') {
        sendJson(res, 200, { session: await service.getSession(id) })
        return true
      }
      if (req.method === 'PATCH') {
        const body = await readJson(req)
        const title = typeof body.title === 'string' ? body.title.trim() : ''
        if (!title) throw new HttpError(400, 'title is required')
        sendJson(res, 200, { session: await service.renameSession(id, title) })
        return true
      }
      if (req.method === 'DELETE') {
        await service.deleteSession(id)
        res.writeHead(204)
        res.end()
        return true
      }
    } catch (error) {
      if (error instanceof PiAgentSessionNotFoundError) throw new HttpError(404, error.message)
      throw error
    }
  }

  const actionMatch = pathname.match(/^\/api\/pi-agent\/sessions\/([^/]+)\/(prompt|abort)$/)
  if (!actionMatch) return false
  const id = decodeURIComponent(actionMatch[1])
  if (req.method === 'POST' && actionMatch[2] === 'abort') {
    await service.abort(id)
    sendJson(res, 200, { ok: true })
    return true
  }
  if (req.method !== 'POST' || actionMatch[2] !== 'prompt') return false

  const body = await readJson(req, 24 * 1024 * 1024)
  const message = typeof body.message === 'string' ? body.message.trim() : ''
  if (!message) throw new HttpError(400, 'message is required')
  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  })
  let disconnected = false
  const handleDisconnect = () => {
    if (res.writableEnded) return
    disconnected = true
    void service.abort(id)
  }
  req.on('aborted', handleDisconnect)
  res.on('close', handleDisconnect)
  await service.prompt(id, {
    message,
    modelId: typeof body.modelId === 'string' ? body.modelId : undefined,
    agentId: typeof body.agentId === 'string' ? body.agentId : undefined,
    contexts: Array.isArray(body.contexts) ? body.contexts : undefined,
    attachments: parseAttachments(body.attachments),
    workspace: parseWorkspace(body.workspace),
  }, (event) => {
    if (!disconnected && !res.writableEnded) res.write(`data: ${JSON.stringify(event)}\n\n`)
  })
  if (!res.writableEnded) res.end()
  return true
}

function parseAttachments(value: unknown): PiAgentAttachmentInput[] | undefined {
  if (value === undefined) return undefined
  if (!Array.isArray(value)) throw new HttpError(400, 'attachments must be an array')
  return value.map((item, index) => {
    if (!item || typeof item !== 'object') throw new HttpError(400, `attachments[${index}] is invalid`)
    const value = item as Record<string, unknown>
    if (typeof value.name !== 'string' || typeof value.mimeType !== 'string'
      || typeof value.size !== 'number' || typeof value.data !== 'string') {
      throw new HttpError(400, `attachments[${index}] is invalid`)
    }
    return { name: value.name, mimeType: value.mimeType, size: value.size, data: value.data }
  })
}

function parseWorkspace(value: unknown) {
  if (!value || typeof value !== 'object') return undefined
  const workspace = value as Record<string, unknown>
  if (workspace.type !== 'app-builder') return undefined
  const artifact = workspace.currentArtifact
  if (!artifact || typeof artifact !== 'object') return { type: 'app-builder' as const }
  const current = artifact as Record<string, unknown>
  if (typeof current.id !== 'string' || typeof current.version !== 'number'
    || typeof current.html !== 'string') throw new HttpError(400, 'workspace.currentArtifact is invalid')
  return { type: 'app-builder' as const, currentArtifact: {
    id: current.id, version: current.version, html: current.html,
  } }
}
