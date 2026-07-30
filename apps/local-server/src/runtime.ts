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
import { startDurableWorkflowNodeRun } from './nodeExecutionService.js'

export function createLocalServerRuntime(config: LocalServerConfig) {
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
  })
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
      const type = run.inputSnapshot.generationConfig.type
      if (type === 'openai-image' || type === 'volc-video') {
        if (!backend.visualTasks.findByRunId(run.id)) {
          void startDurableWorkflowNodeRun(runtime, run.id).catch((error) => {
            backend.runs.failNodeRun(run.id, {
              code: 'recovery_failed',
              message: error instanceof Error ? error.message : String(error),
              retryable: true,
              status: 'interrupted',
            })
          })
        }
      } else {
        backend.runs.failNodeRun(run.id, {
          code: 'server_restarted',
          message: '服务重启中断了文本生成，请重新运行。',
          retryable: true,
          status: 'interrupted',
        })
      }
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
    async start() {
      if (started) return
      started = true
      await plugins.start()
      executions.bootstrap()
      visualTasks.start()
      recoverNodeRuns()
      startRunReaper()
    },
    close() {
      closePromise ??= (async () => {
        stopRunReaper()
        await executions.close()
        await visualTasks.stop()
        await piAgent.close()
        await plugins.close()
        backend.database.sqlite.close()
      })()
      return closePromise
    },
  }
  return runtime
}

export type LocalServerRuntime = ReturnType<typeof createLocalServerRuntime>
