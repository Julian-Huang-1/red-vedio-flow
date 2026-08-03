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
  const piAgents = new CoworkPiAgentManager(config.webDistDir, config.maasApiKey)
  let ownershipClaim: Promise<void> | undefined
  const claimOwnership = (userId: string) => {
    ownershipClaim ??= database.begin(async (tx) => {
      await tx`UPDATE workflows SET owner_id = ${userId}`
      await tx`UPDATE published_apps SET owner_id = ${userId}`
      await tx`UPDATE resources SET owner_id = ${userId}`
      await tx`UPDATE runtime_sessions SET revoked_at = ${Date.now()} WHERE revoked_at IS NULL`
    })
    return ownershipClaim
  }
  let worker: DurableWorker | undefined
  return {
    config,
    database,
    infrastructure,
    providers,
    piAgents,
    claimConfiguredOwnership(user: { id: string; email: string }) {
      if (!config.dataOwnerEmail || user.email.toLowerCase() !== config.dataOwnerEmail) return Promise.resolve()
      return claimOwnership(user.id)
    },
    async start() {
      await migratePostgres(database)
      if (config.dataOwnerEmail) {
        const owners = await database`
          SELECT id FROM app_users WHERE lower(email) = ${config.dataOwnerEmail}
        `
        if (owners.length > 1) throw new Error('configured data owner email is not unique')
        if (owners[0]) await claimOwnership(String(owners[0].id))
      }
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
