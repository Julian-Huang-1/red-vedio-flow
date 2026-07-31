import {
  ExecutionManager,
  ExecutionRepository,
  FileBlobStorage,
  PluginManager,
  PluginVisualService,
  VisualTaskCoordinator,
  createLocalBackend,
} from '@red-video-flow/local-backend'
import { join } from 'node:path'
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
import {
  hydrateChatCache,
  hydrateRunCache,
  hydrateResourceCache,
  hydrateWorkflowAppRunCache,
  hydrateWorkflowCache,
} from './dataServices.js'
import { PersistenceFlushQueue } from './persistenceFlushQueue.js'
import { DurableWorker } from '@red-video-flow/api-server'

export function createLocalServerRuntime(config: LocalServerConfig) {
  const postgres = config.database
    ? createPostgresDatabase(config.database)
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
    databasePath: postgres ? ':memory:' : undefined,
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
  const blobStorage = postgresInfrastructure?.blobs
    ?? new FileBlobStorage(join(config.dataDir, 'blobs'))
  const persistence = new PersistenceFlushQueue()
  if (postgresInfrastructure) {
    backend.workflowRepository.setPersistenceMirror({
      save(document) {
        const operation = (async () => {
          const current = await postgresInfrastructure.workflowDocuments.get(document.id)
          if (current?.revision === document.revision) return
          await postgresInfrastructure.workflowDocuments.save(document, current?.revision)
        })()
        persistence.add(operation)
        return operation
      },
      delete(id) {
        const operation = postgresInfrastructure.workflowDocuments.delete(id).then(() => undefined)
        persistence.add(operation)
        return operation
      },
    })
    backend.runRepository.setPersistenceMirror({
      save(run) {
        const operation = postgresInfrastructure.workflowRuns.save(run).then(() => undefined)
        persistence.add(operation)
        return operation
      },
      appendEvent(runId, type, data) {
        const operation = postgresInfrastructure.workflowRuns
          .appendEvent(runId, type, data)
          .then(() => undefined)
        persistence.add(operation)
        return operation
      },
    })
    backend.workflowAppRuns.setPersistenceMirror((run) => {
      const operation = postgresInfrastructure.postgresWorkflowAppRuns.save(run).then(() => undefined)
      persistence.add(operation)
      return operation
    })
    backend.resources.setPersistenceMirror({
      save(resource) {
        const operation = postgresInfrastructure.postgresResources
          .save(resource)
          .then(() => undefined)
        persistence.add(operation)
        return operation
      },
      delete(id) {
        const operation = postgresInfrastructure.postgresResources.softDelete(id)
        persistence.add(operation)
        return operation
      },
      bind(binding) {
        const operation = postgresInfrastructure.postgresResources
          .bind(binding)
          .then(() => undefined)
        persistence.add(operation)
        return operation
      },
    })
    backend.chatRepository.setPersistenceMirror({
      saveSession(session) {
        const operation = postgresInfrastructure.postgresChats
          .saveSession(session)
          .then(() => undefined)
        persistence.add(operation)
        return operation
      },
      delete(id) {
        const operation = postgresInfrastructure.postgresChats
          .delete(undefined, id)
          .then(() => undefined)
        persistence.add(operation)
        return operation
      },
      saveMessage(message) {
        const operation = postgresInfrastructure.postgresChats
          .saveMessage(message)
          .then(() => undefined)
        persistence.add(operation)
        return operation
      },
    })
  }
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
  let worker: { start(): void; stop(): Promise<void> } | undefined

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
    blobStorage,
    postgresInfrastructure,
    postgresDatabase: postgres,
    flushPersistence: () => persistence.flush(),
    async start() {
      if (started) return
      started = true
      if (postgres) await migratePostgres(postgres)
      await hydrateWorkflowCache(runtime)
      await hydrateRunCache(runtime)
      await hydrateWorkflowAppRunCache(runtime)
      await hydrateResourceCache(runtime)
      await hydrateChatCache(runtime)
      await plugins.start()
      registerBuiltinProviders(runtime)
      executions.bootstrap()
      visualTasks.start()
      worker = postgresInfrastructure
        ? new DurableWorker({
          config: { workerConcurrency: config.workerConcurrency },
          infrastructure: postgresInfrastructure,
          providers: backend.providers,
        })
        : new WorkflowWorker(runtime)
      worker.start()
      if (!postgresInfrastructure) {
        recoverNodeRuns()
        recoverWorkflowRuns()
      }
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
