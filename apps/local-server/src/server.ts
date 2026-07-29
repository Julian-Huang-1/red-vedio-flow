import http from 'node:http'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import {
  resolveLocalServerConfig,
  type LocalServerOptions,
} from './config.js'
import { createLocalServerRuntime } from './runtime.js'
import { createRequestHandler } from './app.js'

export interface LocalServerHandle {
  port: number
  url: string
  runtime: {
    version: 1
    port: number
    baseUrl: string
    instanceId: string
    pid: number
    startedAt: string
  }
  close: () => Promise<void>
}

export async function startLocalServer(
  options: number | LocalServerOptions = {},
): Promise<LocalServerHandle> {
  const config = resolveLocalServerConfig(
    typeof options === 'number' ? { preferredPort: options } : options,
  )
  const runtime = createLocalServerRuntime(config)
  const server = http.createServer()
  const vite = config.webMode === 'vite' ? await createViteMiddleware(config.viteRoot, server) : undefined
  const handler = createRequestHandler(runtime, {
    webFallback: vite
      ? (req, res) => vite.middlewares(req, res, (error?: unknown) => {
          if (error && !res.headersSent) {
            res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' })
            res.end(error instanceof Error ? error.message : String(error))
          } else if (!res.headersSent) {
            res.writeHead(404)
            res.end('not found')
          }
        })
      : undefined,
  })
  server.on('request', handler)
  let port: number

  try {
    await runtime.start()
    port = await listenWithFallback(server, config.host, config.preferredPort)
  } catch (error) {
    await closeHttpServer(server)
    await vite?.close()
    await runtime.close()
    throw error
  }
  const url = `http://${config.host}:${port}`
  const runtimeInfo = runtime.runtimeInfo.publish(port, url)

  console.log(`[red-video-flow] local server listening on ${url}`)
  console.log(`[red-video-flow] data dir: ${config.dataDir}`)
  console.log(
    `[red-video-flow] run timeout: ${config.runTimeoutMs}ms, reaper interval: ${config.runReaperIntervalMs}ms`,
  )
  console.log(
    `[red-video-flow] visual task interval: ${config.visualTaskIntervalMs}ms, batch size: ${config.visualTaskBatchSize}`,
  )
  console.log(
    `[red-video-flow] visual task timeout: image=${config.visualTaskImageTimeoutMs}ms, video=${config.visualTaskVideoTimeoutMs}ms`,
  )
  console.log(`[red-video-flow] plugin dirs: ${config.pluginDirs.join(', ')}`)
  if (config.webMode === 'static' && !existsSync(join(config.distDir, 'index.html'))) {
    console.warn(`[red-video-flow] web app not found at ${config.distDir}`)
  }

  let closePromise: Promise<void> | undefined
  return {
    port,
    url,
    runtime: runtimeInfo,
    close() {
      closePromise ??= (async () => {
        const httpClose = closeHttpServer(server)
        runtime.runtimeInfo.clear()
        await vite?.close()
        await runtime.close()
        await httpClose
      })()
      return closePromise
    },
  }
}

async function createViteMiddleware(root: string, server: http.Server) {
  const moduleName = 'vite'
  const { createServer } = await import(moduleName) as {
    createServer(options: {
      root: string
      appType: 'spa'
      server: {
        middlewareMode: true
        hmr: { server: http.Server }
      }
    }): Promise<{
      middlewares(
        req: http.IncomingMessage,
        res: http.ServerResponse,
        next: (error?: unknown) => void,
      ): void
      close(): Promise<void>
    }>
  }
  return await createServer({
    root,
    appType: 'spa',
    server: {
      middlewareMode: true,
      hmr: { server },
    },
  })
}

async function listenWithFallback(
  server: http.Server,
  host: string,
  preferredPort: number,
) {
  if (preferredPort === 0) {
    await listen(server, host, 0)
    const address = server.address()
    if (!address || typeof address === 'string') throw new Error('Unable to resolve local server address')
    return address.port
  }
  let port = preferredPort
  while (port < preferredPort + 20) {
    try {
      await listen(server, host, port)
      const address = server.address()
      if (!address || typeof address === 'string') throw new Error('Unable to resolve local server address')
      return address.port
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EADDRINUSE') throw error
      port += 1
    }
  }
  throw new Error(`No available local port between ${preferredPort} and ${port - 1}`)
}

function listen(server: http.Server, host: string, port: number) {
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
    server.listen(port, host)
  })
}

function closeHttpServer(server: http.Server) {
  return new Promise<void>((resolveClose, reject) => {
    if (!server.listening) {
      resolveClose()
      return
    }
    server.close((error) => error ? reject(error) : resolveClose())
  })
}
