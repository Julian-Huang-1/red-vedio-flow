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
  close: () => Promise<void>
}

export async function startLocalServer(
  options: number | LocalServerOptions = {},
): Promise<LocalServerHandle> {
  const config = resolveLocalServerConfig(
    typeof options === 'number' ? { preferredPort: options } : options,
  )
  const runtime = createLocalServerRuntime(config)
  const server = http.createServer(createRequestHandler(runtime))
  let port: number

  try {
    await runtime.start()
    port = await listenWithFallback(server, config.host, config.preferredPort)
  } catch (error) {
    await closeHttpServer(server)
    await runtime.close()
    throw error
  }
  const url = `http://${config.host}:${port}`

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
  if (!existsSync(join(config.distDir, 'index.html'))) {
    console.warn(`[red-video-flow] web app not found at ${config.distDir}`)
  }

  let closePromise: Promise<void> | undefined
  return {
    port,
    url,
    close() {
      closePromise ??= (async () => {
        const httpClose = closeHttpServer(server)
        await runtime.close()
        await httpClose
      })()
      return closePromise
    },
  }
}

async function listenWithFallback(
  server: http.Server,
  host: string,
  preferredPort: number,
) {
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
