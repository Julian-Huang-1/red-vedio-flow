import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { createDatabase } from './db/client.js'
import { WorkflowRepository } from './workflows/workflowRepository.js'
import { WorkflowService } from './workflows/workflowService.js'
import { AssetService } from './assets/assetService.js'
import { AgentService } from './agents/service.js'
import { VisualService } from './visual/service.js'

export type CreateLocalBackendOptions = {
  dataDir: string
  cwd?: string
}

export function createLocalBackend(options: CreateLocalBackendOptions) {
  mkdirSync(options.dataDir, { recursive: true })
  const database = createDatabase(join(options.dataDir, 'red-video-flow.sqlite'))
  const workflowRepository = new WorkflowRepository(database)
  const assets = new AssetService(options.dataDir)

  return {
    dataDir: options.dataDir,
    cwd: options.cwd ?? process.cwd(),
    database,
    workflows: new WorkflowService(workflowRepository),
    assets,
    agents: new AgentService(),
    visual: new VisualService(),
  }
}

export type LocalBackend = ReturnType<typeof createLocalBackend>
