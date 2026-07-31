import { startCoworkServer } from './server.js'

const handle = await startCoworkServer()
console.log(`[red-video-flow] Cowork server listening on 0.0.0.0:${handle.runtime.config.port}`)

async function shutdown() {
  await handle.close()
  process.exit(0)
}

process.once('SIGINT', shutdown)
process.once('SIGTERM', shutdown)
