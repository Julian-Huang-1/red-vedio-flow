import http from 'node:http'
import { createRequestHandler } from './app.js'
import { resolveCoworkConfig } from './config.js'
import { createCoworkRuntime } from './runtime.js'

export async function startCoworkServer() {
  const config = resolveCoworkConfig()
  const runtime = createCoworkRuntime(config)
  await runtime.start()
  const server = http.createServer(createRequestHandler(runtime))
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(config.port, config.host, resolve)
  })
  let closing: Promise<void> | undefined
  return {
    runtime,
    server,
    close() {
      closing ??= (async () => {
        await new Promise<void>((resolve, reject) => {
          server.close((error) => error ? reject(error) : resolve())
        })
        await runtime.close()
      })()
      return closing
    },
  }
}
