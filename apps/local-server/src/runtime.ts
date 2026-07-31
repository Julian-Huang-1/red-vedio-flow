import {
  ExecutionManager,
  ExecutionRepository,
  PluginManager,
  PluginVisualService,
  VisualTaskCoordinator,
  createLocalBackend,
} from '@red-video-flow/local-backend'
import type { LocalServerConfig } from './config.js'
import { AgentRegistry } from './agentRegistry.js'
import { AgentRegistrationTokens } from './agentRegistrationTokens.js'
import { AgentModelUpdateTokens } from './agentModelUpdateTokens.js'
import { RuntimeInfoStore } from './runtimeInfo.js'
import { PiAgentService } from './piAgentService.js'
import { WorkflowWorker } from './worker.js'
import { registerBuiltinProviders } from './nodeExecutionService.js'
import {
  createPostgresDatabase,
  createPostgresInfrastructure,
  migratePostgres,
} from '@red-video-flow/postgres-backend'

export function createLocalServerRuntime(config: LocalServerConfig) {
  const postgres = config.databaseUrl
    ? createPostgresDatabase(config.databaseUrl)
    : undefined
  const agentRegistry = new AgentRegistry(config.dataDir)
  const agentRegistrationTokens = new AgentRegistrationTokens()
  const agentModelUpdateTokens = new AgentModelUpdateTokens()
  const runtimeInfo = new RuntimeInfoStore(config.runtimeFilePath)
  const piAgent = new PiAgentService(config.cwd, config.dataDir, config.maasApiKey)
  const plugins = new PluginManager({
    pluginDirs: config.pluginDirs,
    requestTimeoutMs: config.pluginRequestTimeoutMs,
    shutdownGraceMs: config.pluginShutdownGraceMs,
    onStderr: (message) => console.warn(`[red-video-flow] plugin ${message.trimEnd()}`),
  })
  const backend = createLocalBackend({
    dataDir: config.dataDir,
    cwd: config.cwd,
    visual: new PluginVisualService(plugins, {
      requestTimeoutMs: config.runTimeoutMs,
    }),
    visualTaskOptions: {
      pollIntervalMs: config.visualTaskIntervalMs,
      imageTimeoutMs: config.visualTaskImageTimeoutMs,
      videoTimeoutMs: config.visualTaskVideoTimeoutMs,
      leaseDurationMs: config.visualTaskLeaseDurationMs,
    },
    credentialEncryptionKey: config.credentialEncryptionKey,
  })
  const postgresInfrastructure = postgres
    ? createPostgresInfrastructure(postgres, config.credentialEncryptionKey)
    : undefined
  if (postgresInfrastructure) Object.assign(backend, postgresInfrastructure)
  const executions = new ExecutionManager(
    new ExecutionRepository(backend.database),
    plugins,
    { defaultTimeoutMs: config.runTimeoutMs },
  )
  const visualTasks = new VisualTaskCoordinator(backend.visualTasks, {
    intervalMs: config.visualTaskIntervalMs,
    batchSize: config.visualTaskBatchSize,
    onResult: (result) => {
      if (result.completed || result.failed) {
        console.log(
          `[red-video-flow] visual tasks completed=${result.completed} failed=${result.failed} pending=${result.pending}`,
        )
      }
    },
    onError: (error) => {
      console.warn(
        `[red-video-flow] visual task coordinator failed: ${error instanceof Error ? error.message : String(error)}`,
      )
    },
  })
  let worker: WorkflowWorker | undefined

  let runReaperTimer: NodeJS.Timeout | undefined
  let started = false
  let closePromise: Promise<void> | undefined

  function reapTimedOutRuns() {
    try {
      const reaped = backend.runs.reapTimedOutRuns({ timeoutMs: config.runTimeoutMs })
      if (reaped.length) console.warn(`[red-video-flow] reaped ${reaped.length} timed out run(s)`)
    } catch (error) {
      console.warn(
        `[red-video-flow] failed to reap timed out runs: ${error instanceof Error ? error.message : String(error)}`,
      )
    }
  }

  function startRunReaper() {
    if (runReaperTimer || config.runReaperIntervalMs <= 0 || config.runTimeoutMs <= 0) return
    runReaperTimer = setInterval(reapTimedOutRuns, config.runReaperIntervalMs)
    runReaperTimer.unref()
  }

  function stopRunReaper() {
    if (!runReaperTimer) return
    clearInterval(runReaperTimer)
    runReaperTimer = undefined
  }

  function recoverNodeRuns() {
    for (const run of backend.runs.listRecoverableNodeRuns()) {
      if (!backend.visualTasks.findByRunId(run.id)) {
        void backend.jobs.enqueue({
          id: `execute-node:${run.id}`,
          type: 'execute-node',
          payload: { runId: run.id },
          maxAttempts: 1,
        })
      }
    }
  }

  function recoverWorkflowRuns() {
    for (const run of backend.workflowAppRuns.listByStatuses(['queued', 'running'])) {
      void backend.jobs.enqueue({
        id: `schedule-workflow:${run.id}`,
        type: 'schedule-workflow',
        payload: { runId: run.id },
        maxAttempts: 1,
      })
    }
  }

  const runtime = {
    config,
    agentRegistry,
    agentRegistrationTokens,
    agentModelUpdateTokens,
    runtimeInfo,
    piAgent,
    backend,
    plugins,
    executions,
    visualTasks,
    postgresInfrastructure,
    postgresDatabase: postgres,
    async start() {
      if (started) return
      started = true
      if (postgres) await migratePostgres(postgres)
      await plugins.start()
      registerBuiltinProviders(runtime)
      executions.bootstrap()
      visualTasks.start()
      worker = new WorkflowWorker(runtime)
      worker.start()
      recoverNodeRuns()
      recoverWorkflowRuns()
      startRunReaper()
    },
    close() {
      closePromise ??= (async () => {
        stopRunReaper()
        await worker?.stop()
        await executions.close()
        await visualTasks.stop()
        await piAgent.close()
        await plugins.close()
        backend.database.sqlite.close()
        await postgres?.end({ timeout: 5 })
      })()
      return closePromise
    },
  }
  return runtime
}

export type LocalServerRuntime = ReturnType<typeof createLocalServerRuntime>
