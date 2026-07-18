import http from 'node:http'
import { createReadStream, existsSync, mkdirSync, statSync, writeFileSync } from 'node:fs'
import { dirname, extname, join, normalize, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { detectAgents } from './agents.mjs'
import { buildNodePrompt, invokeAgent } from './invoke.mjs'
import { detectVisualModels, invokeVisualModel } from './visual.mjs'

const port = Number(process.env.RED_VEDIO_FLOW_AGENT_PORT ?? 5176)
const serverDir = dirname(fileURLToPath(import.meta.url))
const dataDir = join(serverDir, '.data')
const uploadDir = join(dataDir, 'uploads')
const generatedDir = join(dataDir, 'generated')
const distDir = join(serverDir, '../web/dist')

mkdirSync(uploadDir, { recursive: true })
mkdirSync(generatedDir, { recursive: true })

function sendJson(res, status, payload) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'content-type',
  })
  res.end(JSON.stringify(payload))
}

async function readJson(req) {
  const chunks = []
  for await (const chunk of req) chunks.push(chunk)
  const body = Buffer.concat(chunks).toString('utf8')
  return body ? JSON.parse(body) : {}
}

function writeSse(res, event) {
  res.write(`data: ${JSON.stringify(event)}\n\n`)
}

function safeFileName(name) {
  return String(name || 'asset.bin').replace(/[^\w.-]+/g, '_')
}

function assetUrlForPath(filePath) {
  const rel = relative(dataDir, filePath).split('/').map(encodeURIComponent).join('/')
  return `/api/assets/${rel}`
}

function contentTypeFor(filePath) {
  const ext = extname(filePath).toLowerCase()
  if (ext === '.html') return 'text/html; charset=utf-8'
  if (ext === '.js') return 'text/javascript; charset=utf-8'
  if (ext === '.css') return 'text/css; charset=utf-8'
  if (ext === '.json') return 'application/json; charset=utf-8'
  if (ext === '.svg') return 'image/svg+xml'
  if (ext === '.png') return 'image/png'
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg'
  if (ext === '.webp') return 'image/webp'
  if (ext === '.gif') return 'image/gif'
  if (ext === '.mp4') return 'video/mp4'
  if (ext === '.mov') return 'video/quicktime'
  return 'application/octet-stream'
}

function sendStaticFile(res, filePath) {
  res.writeHead(200, {
    'Content-Type': contentTypeFor(filePath),
  })
  createReadStream(filePath).pipe(res)
}

const server = http.createServer(async (req, res) => {
  try {
    if (req.method === 'OPTIONS') {
      res.writeHead(204, {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'content-type',
        'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
      })
      res.end()
      return
    }

    if (req.method === 'GET' && req.url === '/api/agents') {
      const agents = detectAgents()
      sendJson(res, 200, {
        agents,
        installedCount: agents.filter((agent) => agent.available).length,
        invokableCount: agents.filter((agent) => agent.invokable).length,
        platform: process.platform,
      })
      return
    }

    if (req.method === 'GET' && req.url === '/api/visual-models') {
      const models = detectVisualModels()
      sendJson(res, 200, {
        models,
        installedCount: models.filter((model) => model.available).length,
        invokableCount: models.filter((model) => model.invokable).length,
      })
      return
    }

    if (req.method === 'GET' && req.url?.startsWith('/api/assets/')) {
      const rel = decodeURIComponent(req.url.replace('/api/assets/', ''))
      const filePath = normalize(join(dataDir, rel))
      if (!filePath.startsWith(dataDir) || !existsSync(filePath)) {
        sendJson(res, 404, { error: 'asset not found' })
        return
      }
      res.writeHead(200, {
        'Content-Type': contentTypeFor(filePath),
        'Access-Control-Allow-Origin': '*',
      })
      createReadStream(filePath).pipe(res)
      return
    }

    if (req.method === 'POST' && req.url?.startsWith('/api/upload-asset')) {
      const url = new URL(req.url, `http://${req.headers.host}`)
      const fileName = safeFileName(url.searchParams.get('fileName'))
      const body = Buffer.concat(await Array.fromAsync(req))
      const storedName = `${Date.now()}-${Math.round(Math.random() * 10000)}-${fileName}`
      const filePath = join(uploadDir, storedName)
      writeFileSync(filePath, body)
      sendJson(res, 200, {
        url: assetUrlForPath(filePath),
        localPath: filePath,
        fileName,
      })
      return
    }

    if (req.method === 'POST' && req.url === '/api/run-node') {
      const body = await readJson(req)
      const agentId = body.agentId
      const nodePrompt = buildNodePrompt(body)

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

      const child = invokeAgent({
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

    if (req.method === 'POST' && req.url === '/api/run-visual-node') {
      const body = await readJson(req)
      const runId = `${Date.now()}-${Math.round(Math.random() * 10000)}`
      const downloadDir = join(generatedDir, runId)
      mkdirSync(downloadDir, { recursive: true })

      res.writeHead(200, {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
        'Access-Control-Allow-Origin': '*',
      })

      invokeVisualModel({
        modelId: body.modelId ?? 'dreamina',
        nodeKind: body.nodeKind,
        prompt: body.prompt,
        upstream: body.upstream,
        downloadDir,
        assetUrlForPath,
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
      const url = new URL(req.url ?? '/', `http://${req.headers.host}`)
      const decodedPath = decodeURIComponent(url.pathname)
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

server.on('error', (error) => {
  if (error?.code === 'EADDRINUSE') {
    console.error(`[red-vedio-flow] port ${port} is already in use. Close the existing app or start with RED_VEDIO_FLOW_AGENT_PORT=another_port.`)
    process.exit(1)
  }
  throw error
})

server.listen(port, '127.0.0.1', () => {
  console.log(`[red-vedio-flow] local agent server listening on http://127.0.0.1:${port}`)
  if (existsSync(join(distDir, 'index.html'))) {
    console.log(`[red-vedio-flow] app available at http://127.0.0.1:${port}`)
  } else {
    console.log('[red-vedio-flow] apps/web/dist/index.html not found; run npm run build before production use')
  }
})
