import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { createDatabase } from './db/client.js'
import { WorkflowRepository } from './workflows/workflowRepository.js'
import { WorkflowService } from './workflows/workflowService.js'
import { RunRepository } from './runs/runRepository.js'
import { RunService } from './runs/runService.js'
import { NodeResultProjector } from './runs/nodeResultProjector.js'
import { AssetService } from './assets/assetService.js'
import { ResourceService } from './resources/resourceService.js'
import { AgentPromptService } from './agents/prompt.js'
import { UnavailableVisualService, type VisualServiceContract } from './visual/service.js'
import { VisualTaskRepository } from './visual/taskRepository.js'
import { VisualTaskService, type VisualTaskServiceOptions } from './visual/taskService.js'
import { ChatRepository } from './chats/chatRepository.js'
import { ChatService } from './chats/chatService.js'

export type CreateLocalBackendOptions = {
  dataDir: string
  cwd?: string
  visualTaskOptions?: VisualTaskServiceOptions
  visual?: VisualServiceContract
}

export function createLocalBackend(options: CreateLocalBackendOptions) {
  mkdirSync(options.dataDir, { recursive: true })
  const database = createDatabase(join(options.dataDir, 'red-video-flow.sqlite'))
  const workflowRepository = new WorkflowRepository(database)
  const workflows = new WorkflowService(workflowRepository)
  const runRepository = new RunRepository(database)
  const runs = new RunService(runRepository, workflows)
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
    options.visualTaskOptions,
  )

  return {
    dataDir: options.dataDir,
    cwd: options.cwd ?? process.cwd(),
    database,
    workflows,
    runs,
    nodeResults,
    assets,
    resources,
    prompts: new AgentPromptService(),
    visual,
    visualTasks,
    chats: new ChatService(new ChatRepository(database)),
  }
}

export type LocalBackend = ReturnType<typeof createLocalBackend>
