import { startLocalServer } from './server.js'

const handle = await startLocalServer()

async function shutdown() {
  await handle.close()
  process.exit(0)
}

process.once('SIGINT', shutdown)
process.once('SIGTERM', shutdown)
