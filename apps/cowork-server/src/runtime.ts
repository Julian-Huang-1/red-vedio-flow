import {
  createPostgresDatabase,
  createPostgresInfrastructure,
  migratePostgres,
} from '@red-video-flow/postgres-backend'
import type { CoworkConfig } from './config.js'
import { createProviderRegistry } from './providers.js'
import { DurableWorker } from '@red-video-flow/api-server'
import { CoworkPiAgentManager } from './piAgentManager.js'

export function createCoworkRuntime(config: CoworkConfig) {
  const database = createPostgresDatabase(config.database)
  const infrastructure = createPostgresInfrastructure(
    database,
    config.credentialEncryptionKey,
  )
  const providers = createProviderRegistry(config)
  const piAgents = new CoworkPiAgentManager(config.webDistDir, infrastructure.credentials)
  let worker: DurableWorker | undefined
  return {
    config,
    database,
    infrastructure,
    providers,
    piAgents,
    async start() {
      await migratePostgres(database)
      worker = new DurableWorker(this)
      worker.start()
    },
    async close() {
      await worker?.stop()
      await piAgents.close()
      await database.end({ timeout: 5 })
    },
  }
}

export type CoworkRuntime = ReturnType<typeof createCoworkRuntime>
