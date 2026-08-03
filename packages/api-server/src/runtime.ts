import type { createPostgresInfrastructure } from '@red-video-flow/postgres-backend'
import type {
  Provider,
  ProviderModality,
} from '@red-video-flow/workflow-core'

export type DurableRuntime = {
  config: {
    workerConcurrency: number
    maasApiKey?: string
  }
  infrastructure: ReturnType<typeof createPostgresInfrastructure>
  providers: {
    resolve(providerId: string, modality: ProviderModality): Provider
  }
}
