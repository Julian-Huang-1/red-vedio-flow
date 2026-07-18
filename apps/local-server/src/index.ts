import http, { type IncomingMessage, type ServerResponse } from 'node:http'
import { createReadStream, existsSync, statSync } from 'node:fs'
import { dirname, join, normalize } from 'node:path'
import { fileURLToPath } from 'node:url'
import { contentTypeFor, createLocalBackend } from '@red-video-flow/local-backend'

const port = Number(process.env.RED_VEDIO_FLOW_AGENT_PORT ?? 5176)
const serverDir = dirname(fileURLToPath(import.meta.url))
const appDir = join(serverDir, '..')
const dataDir = process.env.RED_VIDEO_FLOW_DATA_DIR ?? join(appDir, '.data')
const distDir = join(appDir, '../web/dist')
const backend = createLocalBackend({ dataDir, cwd: process.cwd() })

function sendJson(res: ServerResponse, status: number, payload: unknown) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'content-type',
  })
  res.end(JSON.stringify(payload))
}

async function readBuffer(req: IncomingMessage) {
  const chunks: Buffer[] = []
  for await (const chunk of req) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
  return Buffer.concat(chunks)
}

async function readJson(req: IncomingMessage) {
  const body = (await readBuffer(req)).toString('utf8')
  return body ? JSON.parse(body) : {}
}

function writeSse(res: ServerResponse, event: unknown) {
  res.write(`data: ${JSON.stringify(event)}\n\n`)
}

function sendStaticFile(res: ServerResponse, filePath: string) {
  res.writeHead(200, {
    'Content-Type': contentTypeFor(filePath),
  })
  createReadStream(filePath).pipe(res)
}

function workflowIdFromPath(pathname: string) {
  const prefix = '/api/workflows/'
  if (!pathname.startsWith(prefix)) return undefined
  const id = pathname.slice(prefix.length)
  return id ? decodeURIComponent(id) : undefined
}

const server = http.createServer(async (req, res) => {
  try {
    if (req.method === 'OPTIONS') {
      res.writeHead(204, {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'content-type',
        'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
      })
      res.end()
      return
    }

    const url = new URL(req.url ?? '/', `http://${req.headers.host}`)
    const pathname = url.pathname

    if (req.method === 'GET' && pathname === '/api/agents') {
      sendJson(res, 200, backend.agents.list())
      return
    }

    if (req.method === 'GET' && pathname === '/api/visual-models') {
      sendJson(res, 200, backend.visual.listModels())
      return
    }

    if (req.method === 'GET' && pathname === '/api/workflows') {
      sendJson(res, 200, { workflows: backend.workflows.list() })
      return
    }

    if (req.method === 'POST' && pathname === '/api/workflows') {
      const body = await readJson(req)
      sendJson(res, 200, backend.workflows.create(body))
      return
    }

    const workflowId = workflowIdFromPath(pathname)
    if (workflowId && req.method === 'GET') {
      const workflow = backend.workflows.get(workflowId)
      if (!workflow) {
        sendJson(res, 404, { error: 'workflow not found' })
        return
      }
      sendJson(res, 200, workflow)
      return
    }

    if (workflowId && req.method === 'PUT') {
      const body = await readJson(req)
      sendJson(res, 200, backend.workflows.save({ id: workflowId, title: body.title, graph: body.graph }))
      return
    }

    if (workflowId && req.method === 'DELETE') {
      backend.workflows.delete(workflowId)
      sendJson(res, 200, { ok: true })
      return
    }

    if (req.method === 'GET' && pathname.startsWith('/api/assets/')) {
      const filePath = backend.assets.resolveAssetPath(pathname)
      if (!filePath) {
        sendJson(res, 404, { error: 'asset not found' })
        return
      }
      res.writeHead(200, {
        'Content-Type': contentTypeFor(filePath),
        'Access-Control-Allow-Origin': '*',
      })
      backend.assets.createAssetReadStream(filePath).pipe(res)
      return
    }

    if (req.method === 'POST' && pathname === '/api/upload-asset') {
      const fileName = url.searchParams.get('fileName') ?? 'asset.bin'
      const mimeType = url.searchParams.get('mimeType') ?? undefined
      const bytes = await readBuffer(req)
      sendJson(res, 200, backend.assets.upload({ fileName, mimeType, bytes }))
      return
    }

    if (req.method === 'POST' && pathname === '/api/run-node') {
      const body = await readJson(req)
      const agentId = body.agentId
      const nodePrompt = backend.agents.buildNodePrompt(body)

      if (!agentId) {
        sendJson(res, 400, { error: 'agentId is required' })
        return
      }

      res.writeHead(200, {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
        'Access-Control-Allow-Origin': '*',
      })

      const child = backend.agents.invoke({
        agentId,
        prompt: nodePrompt,
        model: body.model,
        cwd: body.cwd,
        onEvent: (event) => {
          writeSse(res, event)
          if (event.type === 'done' || event.type === 'error') res.end()
        },
      })

      res.on('close', () => {
        try {
          child.kill('SIGTERM')
        } catch {}
      })
      return
    }

    if (req.method === 'POST' && pathname === '/api/run-visual-node') {
      const body = await readJson(req)
      const runId = `${Date.now()}-${Math.round(Math.random() * 10000)}`
      const downloadDir = join(backend.assets.generatedDir, runId)

      res.writeHead(200, {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
        'Access-Control-Allow-Origin': '*',
      })

      backend.visual
        .invoke({
          modelId: body.modelId ?? 'dreamina',
          nodeKind: body.nodeKind,
          prompt: body.prompt,
          upstream: body.upstream,
          downloadDir,
          assetUrlForPath: (filePath) => backend.assets.assetUrlForPath(filePath),
          onEvent: (event) => writeSse(res, event),
        })
        .then((result) => {
          writeSse(res, { type: 'done', result })
          res.end()
        })
        .catch((error) => {
          writeSse(res, { type: 'error', message: error instanceof Error ? error.message : String(error) })
          res.end()
        })
      return
    }

    if (req.method === 'GET' || req.method === 'HEAD') {
      const decodedPath = decodeURIComponent(pathname)
      const requestedPath = normalize(join(distDir, decodedPath))

      if (requestedPath.startsWith(distDir) && existsSync(requestedPath) && statSync(requestedPath).isFile()) {
        if (req.method === 'HEAD') {
          res.writeHead(200, { 'Content-Type': contentTypeFor(requestedPath) })
          res.end()
          return
        }
        sendStaticFile(res, requestedPath)
        return
      }

      const indexPath = join(distDir, 'index.html')
      if (existsSync(indexPath)) {
        if (req.method === 'HEAD') {
          res.writeHead(200, { 'Content-Type': contentTypeFor(indexPath) })
          res.end()
          return
        }
        sendStaticFile(res, indexPath)
        return
      }
    }

    sendJson(res, 404, { error: 'not found' })
  } catch (error) {
    if (!res.headersSent) {
      sendJson(res, 500, { error: error instanceof Error ? error.message : String(error) })
      return
    }
    writeSse(res, { type: 'error', message: error instanceof Error ? error.message : String(error) })
    res.end()
  }
})

server.on('error', (error: NodeJS.ErrnoException) => {
  if (error?.code === 'EADDRINUSE') {
    console.error(`[red-vedio-flow] port ${port} is already in use. Close the existing app or start with RED_VEDIO_FLOW_AGENT_PORT=another_port.`)
    process.exit(1)
  }
  throw error
})

server.listen(port, '127.0.0.1', () => {
  console.log(`[red-vedio-flow] local server listening on http://127.0.0.1:${port}`)
  console.log(`[red-vedio-flow] data dir: ${dataDir}`)
  if (existsSync(join(distDir, 'index.html'))) {
    console.log(`[red-vedio-flow] app available at http://127.0.0.1:${port}`)
  } else {
    console.log('[red-vedio-flow] apps/web/dist/index.html not found; run pnpm build before production use')
  }
})
