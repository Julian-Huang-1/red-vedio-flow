export * from './database.js'
export * from './userRepository.js'
export * from './credentialStore.js'
export * from './jobQueue.js'
export * from './blobStorage.js'
export * from './workflowRepository.js'
export * from './workflowAppRunRepository.js'
export * from './runRepository.js'
export * from './resourceRepository.js'
export * from './chatRepository.js'
export * from './workflowService.js'

import type { PostgresDatabase } from './database.js'
import { PostgresCredentialStore } from './credentialStore.js'
import { PostgresJobQueue } from './jobQueue.js'
import { PostgresLargeObjectStorage } from './blobStorage.js'
import { PostgresUserRepository } from './userRepository.js'
import { PostgresWorkflowRepository } from './workflowRepository.js'
import { PostgresWorkflowAppRunRepository } from './workflowAppRunRepository.js'
import { PostgresRunRepository } from './runRepository.js'
import { PostgresResourceRepository } from './resourceRepository.js'
import { PostgresChatRepository } from './chatRepository.js'
import { PostgresWorkflowService } from './workflowService.js'

export function createPostgresInfrastructure(
  sql: PostgresDatabase,
  credentialEncryptionKey: string,
) {
  return {
    users: new PostgresUserRepository(sql),
    credentials: new PostgresCredentialStore(sql, credentialEncryptionKey),
    jobs: new PostgresJobQueue(sql),
    blobs: new PostgresLargeObjectStorage(sql),
    workflowDocuments: new PostgresWorkflowRepository(sql),
    postgresWorkflows: new PostgresWorkflowService(new PostgresWorkflowRepository(sql)),
    workflowRuns: new PostgresRunRepository(sql),
    postgresWorkflowAppRuns: new PostgresWorkflowAppRunRepository(sql),
    postgresResources: new PostgresResourceRepository(sql),
    postgresChats: new PostgresChatRepository(sql),
  }
}
