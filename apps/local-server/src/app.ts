import {
  WorkflowConflictError,
  WorkflowRunError,
} from '@red-video-flow/local-backend'
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { LocalServerRuntime } from './runtime.js'
import { HttpError, sendJson } from './http.js'
import { handlePluginRoutes } from './routes/pluginRoutes.js'
import { handleDiscoveryRoutes } from './routes/discoveryRoutes.js'
import { handleWorkflowRoutes } from './routes/workflowRoutes.js'
import { handleAssetRoutes } from './routes/assetRoutes.js'
import { handleRunRoutes } from './routes/runRoutes.js'
import { handleStaticRoutes } from './routes/staticRoutes.js'

export function createRequestHandler(runtime: LocalServerRuntime) {
  return async (req: IncomingMessage, res: ServerResponse) => {
    try {
      if (!isAllowedOrigin(req.headers.origin)) {
        sendJson(res, 403, { error: 'cross-origin access is restricted to localhost' })
        return
      }
      if (req.method === 'OPTIONS') {
        res.writeHead(204, {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Headers': 'content-type',
          'Access-Control-Allow-Methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
        })
        res.end()
        return
      }

      const url = new URL(req.url ?? '/', `http://${req.headers.host ?? '127.0.0.1'}`)
      const context = { req, res, url, pathname: url.pathname }
      const handlers = [
        handlePluginRoutes,
        handleDiscoveryRoutes,
        handleWorkflowRoutes,
        handleAssetRoutes,
        handleRunRoutes,
      ]

      for (const handler of handlers) {
        if (await handler(runtime, context)) return
      }
      if (url.pathname.startsWith('/api/')) {
        sendJson(res, 404, { error: 'not found' })
        return
      }
      if (await handleStaticRoutes(runtime, context)) return
      sendJson(res, 404, { error: 'not found' })
    } catch (error) {
      if (!res.headersSent) {
        if (error instanceof HttpError) {
          sendJson(res, error.status, { error: error.message })
          return
        }
        if (error instanceof WorkflowConflictError) {
          sendJson(res, 409, { error: error.message, currentRevision: error.currentRevision })
          return
        }
        if (error instanceof WorkflowRunError) {
          sendJson(res, 400, { error: error.message })
          return
        }
        sendJson(res, 500, { error: error instanceof Error ? error.message : String(error) })
        return
      }
      res.write(`data: ${JSON.stringify({
        type: 'error',
        message: error instanceof Error ? error.message : String(error),
      })}\n\n`)
      res.end()
    }
  }
}

function isAllowedOrigin(origin: string | undefined) {
  if (!origin) return true
  try {
    const hostname = new URL(origin).hostname
    return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]'
  } catch {
    return false
  }
}
