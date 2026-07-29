import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { createDatabase } from './db/client.js'
import { WorkflowRepository } from './workflows/workflowRepository.js'
import { WorkflowService } from './workflows/workflowService.js'
import { RunRepository } from './runs/runRepository.js'
import { RunService } from './runs/runService.js'
import { AssetService } from './assets/assetService.js'
import { AgentPromptService } from './agents/prompt.js'
import { UnavailableVisualService, type VisualServiceContract } from './visual/service.js'
import { VisualTaskRepository } from './visual/taskRepository.js'
import { VisualTaskService, type VisualTaskServiceOptions } from './visual/taskService.js'

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
  const assets = new AssetService(options.dataDir)
  const visual = options.visual ?? new UnavailableVisualService()
  const visualTaskRepository = new VisualTaskRepository(database)
  const visualTasks = new VisualTaskService(
    visualTaskRepository,
    workflows,
    visual,
    assets,
    options.visualTaskOptions,
  )

  return {
    dataDir: options.dataDir,
    cwd: options.cwd ?? process.cwd(),
    database,
    workflows,
    runs: new RunService(runRepository, workflows),
    assets,
    prompts: new AgentPromptService(),
    visual,
    visualTasks,
  }
}

export type LocalBackend = ReturnType<typeof createLocalBackend>
