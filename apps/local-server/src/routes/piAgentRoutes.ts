import type { LocalServerRuntime } from '../runtime.js'
import {
  PiAgentSessionNotFoundError,
  type PiAgentAttachmentInput,
} from '../piAgentService.js'
import { HttpError, readJson, sendJson, writeSse, type RequestContext } from '../http.js'

export async function handlePiAgentRoutes(runtime: LocalServerRuntime, ctx: RequestContext) {
  const { req, res, pathname } = ctx

  if (req.method === 'GET' && pathname === '/api/pi-agent/models') {
    sendJson(res, 200, { models: await runtime.piAgent.listModels() })
    return true
  }

  if (pathname === '/api/pi-agent/sessions') {
    if (req.method === 'GET') {
      sendJson(res, 200, {
        sessions: await runtime.piAgent.listSessions(ctx.url.searchParams.get('q') ?? undefined),
      })
      return true
    }
    if (req.method === 'POST') {
      const body = await readJson(req)
      sendJson(res, 201, {
        session: await runtime.piAgent.createSession({
          id: typeof body.id === 'string' ? body.id : undefined,
          title: typeof body.title === 'string' ? body.title : undefined,
        }),
      })
      return true
    }
  }

  const sessionMatch = pathname.match(/^\/api\/pi-agent\/sessions\/([^/]+)$/)
  if (sessionMatch) {
    const sessionId = decodeURIComponent(sessionMatch[1])
    try {
      if (req.method === 'GET') {
        sendJson(res, 200, { session: await runtime.piAgent.getSession(sessionId) })
        return true
      }
      if (req.method === 'PATCH') {
        const body = await readJson(req)
        const title = typeof body.title === 'string' ? body.title.trim() : ''
        if (!title) throw new HttpError(400, 'title is required')
        sendJson(res, 200, { session: await runtime.piAgent.renameSession(sessionId, title) })
        return true
      }
      if (req.method === 'DELETE') {
        await runtime.piAgent.deleteSession(sessionId)
        res.writeHead(204, { 'Access-Control-Allow-Origin': '*' })
        res.end()
        return true
      }
    } catch (error) {
      if (error instanceof PiAgentSessionNotFoundError) {
        throw new HttpError(404, error.message)
      }
      throw error
    }
  }

  const match = pathname.match(/^\/api\/pi-agent\/sessions\/([^/]+)\/(prompt|abort)$/)
  if (!match) return false
  const sessionId = decodeURIComponent(match[1])

  if (req.method === 'POST' && match[2] === 'abort') {
    await runtime.piAgent.abort(sessionId)
    sendJson(res, 200, { ok: true })
    return true
  }

  if (req.method !== 'POST' || match[2] !== 'prompt') return false
  const body = await readJson(req, 24 * 1024 * 1024)
  const message = typeof body.message === 'string' ? body.message.trim() : ''
  if (!message) throw new HttpError(400, 'message is required')

  const contexts = Array.isArray(body.contexts)
    ? body.contexts.filter((item: unknown) => item && typeof item === 'object')
    : undefined
  const attachments = parseAttachments(body.attachments)
  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    'Access-Control-Allow-Origin': '*',
  })

  let disconnected = false
  const handleDisconnect = () => {
    if (res.writableEnded) return
    disconnected = true
    void runtime.piAgent.abort(sessionId)
  }
  req.on('aborted', handleDisconnect)
  res.on('close', handleDisconnect)
  await runtime.piAgent.prompt(
    sessionId,
    {
      message,
      modelId: typeof body.modelId === 'string' ? body.modelId : undefined,
      contexts,
      attachments,
    },
    (event) => {
      if (!disconnected && !res.writableEnded) writeSse(res, event)
    },
  )
  if (!res.writableEnded) res.end()
  return true
}

function parseAttachments(value: unknown): PiAgentAttachmentInput[] | undefined {
  if (value === undefined) return undefined
  if (!Array.isArray(value)) throw new HttpError(400, 'attachments must be an array')
  return value.map((item, index) => {
    if (!item || typeof item !== 'object') {
      throw new HttpError(400, `attachments[${index}] must be an object`)
    }
    const candidate = item as Record<string, unknown>
    if (
      typeof candidate.name !== 'string'
      || typeof candidate.mimeType !== 'string'
      || typeof candidate.size !== 'number'
      || typeof candidate.data !== 'string'
    ) {
      throw new HttpError(400, `attachments[${index}] is invalid`)
    }
    return {
      name: candidate.name,
      mimeType: candidate.mimeType,
      size: candidate.size,
      data: candidate.data,
    }
  })
}
