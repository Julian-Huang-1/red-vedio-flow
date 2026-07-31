import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { createDatabase } from './db/client.js'
import { WorkflowRepository } from './workflows/workflowRepository.js'
import { WorkflowService } from './workflows/workflowService.js'
import { RunRepository } from './runs/runRepository.js'
import { RunService } from './runs/runService.js'
import { WorkflowAppRunRepository } from './runs/workflowAppRunRepository.js'
import { NodeResultProjector } from './runs/nodeResultProjector.js'
import { AssetService } from './assets/assetService.js'
import { ResourceService } from './resources/resourceService.js'
import { AgentPromptService } from './agents/prompt.js'
import { UnavailableVisualService, type VisualServiceContract } from './visual/service.js'
import { VisualTaskRepository } from './visual/taskRepository.js'
import { VisualTaskService, type VisualTaskServiceOptions } from './visual/taskService.js'
import { ChatRepository } from './chats/chatRepository.js'
import { ChatService } from './chats/chatService.js'
import { UserRepository } from './auth/userRepository.js'
import { CredentialStore } from './auth/credentialStore.js'
import { ProviderRegistry } from './providers/providerRegistry.js'
import { LocalJobQueue } from './jobs/jobQueue.js'

export type CreateLocalBackendOptions = {
  dataDir: string
  databasePath?: string
  cwd?: string
  visualTaskOptions?: VisualTaskServiceOptions
  visual?: VisualServiceContract
  credentialEncryptionKey?: string
}

export function createLocalBackend(options: CreateLocalBackendOptions) {
  mkdirSync(options.dataDir, { recursive: true })
  const database = createDatabase(
    options.databasePath ?? join(options.dataDir, 'red-video-flow.sqlite'),
  )
  const users = new UserRepository(database)
  const credentials = new CredentialStore(
    database,
    options.credentialEncryptionKey ?? `local-development:${options.dataDir}`,
  )
  const workflowRepository = new WorkflowRepository(database)
  const workflows = new WorkflowService(workflowRepository)
  const runRepository = new RunRepository(database)
  const runs = new RunService(runRepository, workflows)
  const workflowAppRuns = new WorkflowAppRunRepository(database)
  const resources = new ResourceService(database)
  const assets = new AssetService(options.dataDir, database, resources)
  const nodeResults = new NodeResultProjector(workflows, runs, assets, resources)
  const visual = options.visual ?? new UnavailableVisualService()
  const visualTaskRepository = new VisualTaskRepository(database)
  const visualTasks = new VisualTaskService(
    visualTaskRepository,
    workflows,
    visual,
    assets,
    runs,
    nodeResults,
    credentials,
    options.visualTaskOptions,
  )
  const chatRepository = new ChatRepository(database)

  return {
    dataDir: options.dataDir,
    cwd: options.cwd ?? process.cwd(),
    database,
    workflows,
    workflowRepository,
    runRepository,
    runs,
    workflowAppRuns,
    nodeResults,
    assets,
    resources,
    prompts: new AgentPromptService(),
    visual,
    visualTasks,
    chats: new ChatService(chatRepository),
    chatRepository,
    users,
    credentials,
    providers: new ProviderRegistry(),
    jobs: new LocalJobQueue(database),
  }
}

export type LocalBackend = ReturnType<typeof createLocalBackend>
