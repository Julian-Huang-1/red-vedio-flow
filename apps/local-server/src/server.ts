import http, { type IncomingMessage, type ServerResponse } from 'node:http'
import { createReadStream, existsSync, statSync } from 'node:fs'
import { dirname, join, normalize, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { WorkflowConflictError, WorkflowRunError, contentTypeFor, createLocalBackend } from '@red-video-flow/local-backend'

const serverDir = dirname(fileURLToPath(import.meta.url))
const appDir = join(serverDir, '..')
const dataDir = process.env.RED_VIDEO_FLOW_DATA_DIR ?? join(appDir, '.data')
const distDir = resolve(process.env.RED_VIDEO_FLOW_WEB_DIST_DIR ?? join(appDir, '../web/dist'))
const backend = createLocalBackend({ dataDir, cwd: process.cwd() })
const workspaceRoot = resolve(appDir, '../..')
const rvfCliCommand = process.env.RVF_CLI_COMMAND ?? 'pnpm --filter @red-video-flow/workflow-cli start --'
const runTimeoutMs = Number(process.env.RED_VIDEO_FLOW_RUN_TIMEOUT_MS ?? 120_000)
const runReaperIntervalMs = Number(process.env.RED_VIDEO_FLOW_RUN_REAPER_INTERVAL_MS ?? 30_000)
let runReaperTimer: NodeJS.Timeout | undefined

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
  return id && !id.includes('/') ? decodeURIComponent(id) : undefined
}

function nodeRunPathFromPath(pathname: string) {
  const prefix = '/api/workflows/'
  if (!pathname.startsWith(prefix)) return undefined
  const parts = pathname.slice(prefix.length).split('/').map((part) => decodeURIComponent(part))
  const [workflowId, nodesLiteral, nodeId, runsLiteral, runId, action] = parts
  if (!workflowId || nodesLiteral !== 'nodes' || !nodeId || runsLiteral !== 'runs') return undefined
  return { workflowId, nodeId, runId, action }
}

function reapTimedOutRuns() {
  try {
    const reaped = backend.runs.reapTimedOutRuns({ timeoutMs: runTimeoutMs })
    if (reaped.length) {
      console.warn(`[red-video-flow] reaped ${reaped.length} timed out run(s)`)
    }
  } catch (error) {
    console.warn(`[red-video-flow] failed to reap timed out runs: ${error instanceof Error ? error.message : String(error)}`)
  }
}

function startRunReaper() {
  if (runReaperTimer || runReaperIntervalMs <= 0 || runTimeoutMs <= 0) return
  runReaperTimer = setInterval(reapTimedOutRuns, runReaperIntervalMs)
  runReaperTimer.unref()
}

function stopRunReaper() {
  if (!runReaperTimer) return
  clearInterval(runReaperTimer)
  runReaperTimer = undefined
}

const server = http.createServer(async (req, res) => {
  try {
    if (req.method === 'OPTIONS') {
      res.writeHead(204, {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'content-type',
        'Access-Control-Allow-Methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
      })
      res.end()
      return
    }

    const url = new URL(req.url ?? '/', `http://${req.headers.host}`)
    const pathname = url.pathname

    if (req.method === 'GET' && pathname === '/api/health') {
      sendJson(res, 200, { ok: true, service: 'red-video-flow' })
      return
    }

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

    const nodeRunPath = nodeRunPathFromPath(pathname)
    if (nodeRunPath && req.method === 'POST' && !nodeRunPath.runId) {
      const body = await readJson(req)
      sendJson(res, 200, backend.runs.start({
        workflowId: nodeRunPath.workflowId,
        nodeId: nodeRunPath.nodeId,
        prompt: body.prompt,
        baseRevision: body.baseRevision,
      }))
      return
    }

    if (nodeRunPath && req.method === 'POST' && nodeRunPath.runId && nodeRunPath.action === 'heartbeat') {
      sendJson(res, 200, { run: backend.runs.heartbeat(nodeRunPath.workflowId, nodeRunPath.nodeId, nodeRunPath.runId) })
      return
    }

    if (nodeRunPath && req.method === 'POST' && nodeRunPath.runId && nodeRunPath.action === 'complete') {
      const body = await readJson(req)
      sendJson(res, 200, backend.runs.complete({
        workflowId: nodeRunPath.workflowId,
        nodeId: nodeRunPath.nodeId,
        runId: nodeRunPath.runId,
        baseRevision: body.baseRevision,
        value: body.value,
        status: body.status,
        message: body.message ?? '生成完成',
      }))
      return
    }

    if (nodeRunPath && req.method === 'POST' && nodeRunPath.runId && nodeRunPath.action === 'fail') {
      const body = await readJson(req)
      sendJson(res, 200, backend.runs.fail({
        workflowId: nodeRunPath.workflowId,
        nodeId: nodeRunPath.nodeId,
        runId: nodeRunPath.runId,
        baseRevision: body.baseRevision,
        message: body.message ?? 'Agent 执行失败',
      }))
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
      sendJson(res, 200, backend.workflows.save({ id: workflowId, title: body.title, baseRevision: body.baseRevision, graph: body.graph }))
      return
    }

    if (workflowId && req.method === 'PATCH') {
      const body = await readJson(req)
      sendJson(res, 200, {
        workflow: backend.workflows.patch({ id: workflowId, baseRevision: body.baseRevision, ops: body.ops ?? [] }),
        appliedOps: Array.isArray(body.ops) ? body.ops.length : 0,
      })
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
      const baseUrl = body.baseUrl ?? `http://${req.headers.host}`
      const nodePrompt = backend.agents.buildNodePrompt({
        ...body,
        baseUrl,
        rvfCommand: rvfCliCommand,
      })

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
        env: {
          RED_VIDEO_FLOW_BASE_URL: baseUrl,
          RVF_WORKFLOW_ID: body.workflowId,
          RVF_NODE_ID: body.currentNode?.id,
          RVF_BASE_REVISION: body.workflowRevision === undefined ? undefined : String(body.workflowRevision),
          RVF_CLI_COMMAND: rvfCliCommand,
          PATH: [
            join(workspaceRoot, 'node_modules/.bin'),
            join(workspaceRoot, 'packages/workflow-cli/node_modules/.bin'),
            process.env.PATH ?? '',
          ].join(process.platform === 'win32' ? ';' : ':'),
        },
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
    writeSse(res, { type: 'error', message: error instanceof Error ? error.message : String(error) })
    res.end()
  }
})

export interface LocalServerHandle {
  port: number
  url: string
  close: () => Promise<void>
}

function listen(port: number) {
  return new Promise<void>((resolveListen, reject) => {
    const onError = (error: Error) => {
      server.off('listening', onListening)
      reject(error)
    }
    const onListening = () => {
      server.off('error', onError)
      resolveListen()
    }
    server.once('error', onError)
    server.once('listening', onListening)
    server.listen(port, '127.0.0.1')
  })
}

export async function startLocalServer(preferredPort = Number(process.env.RED_VEDIO_FLOW_AGENT_PORT ?? 5176)): Promise<LocalServerHandle> {
  let port = preferredPort
  while (port < preferredPort + 20) {
    try {
      await listen(port)
      const url = `http://127.0.0.1:${port}`
      console.log(`[red-video-flow] local server listening on ${url}`)
      console.log(`[red-video-flow] data dir: ${dataDir}`)
      console.log(`[red-video-flow] run timeout: ${runTimeoutMs}ms, reaper interval: ${runReaperIntervalMs}ms`)
      if (!existsSync(join(distDir, 'index.html'))) {
        console.warn(`[red-video-flow] web app not found at ${distDir}`)
      }
      startRunReaper()
      return {
        port,
        url,
        close: () =>
          new Promise<void>((resolveClose, reject) => {
            stopRunReaper()
            server.close((error) => (error ? reject(error) : resolveClose()))
          }),
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EADDRINUSE') throw error
      port += 1
    }
  }
  throw new Error(`No available local port between ${preferredPort} and ${port - 1}`)
}
