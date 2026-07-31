import type {
  NodeResult,
  NodeRunInput,
  NodeRunTrace,
  ProviderExecutionContext,
} from '@red-video-flow/workflow-core'
import {
  NetworkBoundaryProvider,
  ProviderBoundaryError,
} from '@red-video-flow/workflow-runtime/network-provider'
import { persistGeneratedResultResources } from '@red-video-flow/api-server'
import { ProviderRegistry } from '@red-video-flow/local-backend'
import type { LocalServerRuntime } from './runtime.js'

export type WorkflowNodeRunEvent =
  | { type: 'run'; status: 'queued' | 'running'; runId: string; workflowRevision?: number; providerTask?: { providerId: string; taskId?: string; responseId?: string } }
  | { type: 'text_delta'; runId: string; delta: string }
  | { type: 'result'; runId: string; result: NodeResult }
  | { type: 'done'; runId: string; resultIds: string[]; workflowRevision?: number }
  | { type: 'error'; runId: string; code?: string; message: string; retryable: boolean; workflowRevision?: number }

type ExecuteInput = {
  runId: string
  workflowId: string
  nodeId: string
  input: NodeRunInput
  signal: AbortSignal
  emit: (event: WorkflowNodeRunEvent) => void
  token?: string
}

export async function executeWorkflowNodeRun(
  runtime: LocalServerRuntime,
  execution: ExecuteInput,
) {
  registerBuiltinProviders(runtime)
  execution.emit({ type: 'run', status: 'queued', runId: execution.runId })
  const runningRevision = persistNodeStatus(runtime, execution, 'running')
  execution.emit({
    type: 'run',
    status: 'running',
    runId: execution.runId,
    workflowRevision: runningRevision,
  })
  updateTrace(runtime, execution, {
    runId: execution.runId,
    nodeId: execution.nodeId,
    providerId: execution.input.model.providerId,
    modelId: execution.input.model.modelId,
    composer: sanitizeTraceValue(execution.input) as NodeRunInput,
    startedAt: Date.now(),
  })

  try {
    const configType = execution.input.generationConfig.type
    const modality = configType === 'openai-text'
      ? 'text'
      : configType === 'openai-image'
        ? 'image'
        : configType === 'volc-video'
          ? 'video'
          : undefined
    if (!modality) {
      throw new ProviderExecutionError(
        'unsupported_config',
        `Unsupported generation config: ${configType}`,
        false,
      )
    }
    const provider = runtime.backend.providers.resolve(
      execution.input.model.providerId,
      modality,
    )
    const providerResult = await provider.execute(
      execution.input,
      providerContext(runtime, execution),
    )
    const results = providerResult.results
    const infrastructure = runtime.postgresInfrastructure
    await persistGeneratedResultResources({
      resources: {
        save: async (resource, blobId) => {
          if (infrastructure) {
            await infrastructure.postgresResources.save(resource, blobId)
          }
          runtime.backend.resources.hydrate(resource)
        },
        bind: async (input) => {
          const binding = infrastructure
            ? await infrastructure.postgresResources.bind(input)
            : runtime.backend.resources.bind(input)
          if (infrastructure) runtime.backend.resources.hydrateBinding(binding)
          return binding
        },
      },
      workflowId: execution.workflowId,
      nodeId: execution.nodeId,
      runId: execution.runId,
      results,
    })

    const workflowRevision = persistNodeResults(runtime, execution, results)
    for (const result of results) {
      execution.emit({ type: 'result', runId: execution.runId, result })
    }
    execution.emit({
      type: 'done',
      runId: execution.runId,
      resultIds: results.map((result) => result.id),
      workflowRevision,
    })
    finishTrace(runtime, execution, {})
  } catch (error) {
    const normalized = normalizeError(error)
    finishTrace(runtime, execution, { error: normalized.message })
    const workflowRevision = persistNodeStatus(runtime, execution, 'error')
    execution.emit({
      type: 'error',
      runId: execution.runId,
      code: normalized.code,
      message: normalized.message,
      retryable: normalized.retryable,
      workflowRevision,
    })
  }
}

export function registerBuiltinProviders(runtime: LocalServerRuntime) {
  if (!runtime.backend.providers) {
    Object.assign(runtime.backend, { providers: new ProviderRegistry() })
  }
  if (runtime.backend.providers.list().length) return
  runtime.backend.providers.register(new NetworkBoundaryProvider(
    'rednote-maas',
    'text',
    runtime.config.textProviderUrl,
  ))
  runtime.backend.providers.setFallback(new NetworkBoundaryProvider(
    'builtin.image',
    'image',
    runtime.config.imageProviderUrl,
  ))
  runtime.backend.providers.setFallback(new NetworkBoundaryProvider(
    'builtin.video',
    'video',
    runtime.config.videoProviderUrl,
  ))
}

function providerContext(
  runtime: LocalServerRuntime,
  execution: ExecuteInput,
): ProviderExecutionContext {
  return {
    runId: execution.runId,
    workflowId: execution.workflowId,
    nodeId: execution.nodeId,
    userId: runtime.backend.runs.getNodeRun(execution.runId)?.userId ?? 'local',
    token: execution.token ?? runtime.config.maasApiKey,
    signal: execution.signal,
    blobs: runtime.blobStorage,
    emit: (event) => {
      if (event.type === 'text-delta') {
        execution.emit({
          type: 'text_delta',
          runId: execution.runId,
          delta: event.delta,
        })
      } else if (event.type === 'provider-task') {
        execution.emit({
          type: 'run',
          status: 'running',
          runId: execution.runId,
          providerTask: {
            providerId: execution.input.model.providerId,
            taskId: event.taskId,
          },
        })
      }
    },
    trace: {
      recordProviderInput: async (input) => {
        updateTrace(runtime, execution, { providerInput: input })
      },
      recordNetworkRequest: async (request) => {
        appendNetworkRequest(runtime, execution, request)
      },
      recordResponse: async (response) => {
        updateTrace(runtime, execution, { response })
      },
    },
  }
}

export async function startDurableWorkflowNodeRun(
  runtime: LocalServerRuntime,
  runId: string,
  signal: AbortSignal = new AbortController().signal,
) {
  const run = runtime.backend.runs.getNodeRun(runId)
  if (!run) throw new Error(`node run not found: ${runId}`)
  const token = run.userId
    ? await runtime.backend.credentials.getModelToken(run.userId)
    : undefined
  if (run.userId && !token) {
    throw new ProviderExecutionError(
      'model_credential_missing',
      '请先在设置中保存模型 API Token。',
      false,
    )
  }

  await executeWorkflowNodeRun(runtime, {
    runId,
    workflowId: run.workflowId,
    nodeId: run.nodeId,
    input: run.inputSnapshot,
    signal,
    token,
    emit: (event) => {
      if (event.type === 'run' && event.status === 'running') {
        runtime.backend.runs.markNodeRunRunning(runId)
        if (event.providerTask) {
          runtime.backend.runs.attachNodeProviderTask(runId, event.providerTask)
        }
        return
      }
      if (event.type === 'text_delta') {
        runtime.backend.runs.appendNodeRunEvent(runId, event.type, event)
        return
      }
      if (event.type === 'done') {
        const workflow = runtime.backend.workflows.get(run.workflowId)
        const node = workflow?.graph.nodes.find((item) => item.id === run.nodeId)
        const results = (node?.data.results ?? [])
          .filter((result) => event.resultIds.includes(result.id))
        runtime.backend.runs.completeNodeRun(runId, results, event.workflowRevision)
        return
      }
      if (event.type === 'error') {
        runtime.backend.runs.failNodeRun(runId, {
          code: event.code,
          message: event.message,
          retryable: event.retryable,
        })
      }
    },
  })
}

function persistNodeStatus(
  runtime: LocalServerRuntime,
  execution: ExecuteInput,
  status: 'running' | 'error',
) {
  const current = runtime.backend.workflows.get(execution.workflowId)
  if (!current) return undefined
  return runtime.backend.workflows.patch({
    id: execution.workflowId,
    baseRevision: current.revision,
    ops: [
      { type: 'setNodeLatestRun', nodeId: execution.nodeId, runId: execution.runId },
      { type: 'setNodeStatus', nodeId: execution.nodeId, status },
    ],
  }).revision
}

function persistNodeResults(
  runtime: LocalServerRuntime,
  execution: ExecuteInput,
  results: NodeResult[],
) {
  const current = runtime.backend.workflows.get(execution.workflowId)
  if (!current) return undefined
  return runtime.backend.workflows.patch({
    id: execution.workflowId,
    baseRevision: current.revision,
    ops: [
      {
        type: 'setNodeLatestRun',
        nodeId: execution.nodeId,
        runId: execution.runId,
      },
      ...results.map((result) => ({
        type: 'appendNodeResult' as const,
        nodeId: execution.nodeId,
        result,
        makeCurrent: true,
      })),
      { type: 'setNodeStatus', nodeId: execution.nodeId, status: 'done' },
    ],
  }).revision
}

function updateTrace(
  runtime: LocalServerRuntime,
  execution: ExecuteInput,
  patch: Record<string, unknown>,
) {
  const existing = runtime.backend.runs.getNodeRun(execution.runId)?.trace
  if (!existing && !('runId' in patch)) return
  const sanitizedPatch = sanitizeTraceValue(patch) as Record<string, unknown>
  runtime.backend.runs.updateNodeRunTrace(execution.runId, {
    ...(existing ?? patch),
    ...sanitizedPatch,
  } as NodeRunTrace)
}

function finishTrace(
  runtime: LocalServerRuntime,
  execution: ExecuteInput,
  patch: Record<string, unknown>,
) {
  const trace = runtime.backend.runs.getNodeRun(execution.runId)?.trace
  if (!trace) return
  const finishedAt = Date.now()
  updateTrace(runtime, execution, {
    ...patch,
    finishedAt,
    durationMs: finishedAt - trace.startedAt,
  })
}

function appendNetworkRequest(
  runtime: LocalServerRuntime,
  execution: ExecuteInput,
  request: NonNullable<NodeRunTrace['networkRequests']>[number],
) {
  const trace = runtime.backend.runs.getNodeRun(execution.runId)?.trace
  updateTrace(runtime, execution, {
    networkRequests: [...(trace?.networkRequests ?? []), request],
  })
}

const secretKeyPattern =
  /(authorization|api[-_]?key|token|secret|password|cookie)/i

function sanitizeTraceValue(value: unknown, key = ''): unknown {
  if (secretKeyPattern.test(key)) return '[REDACTED]'
  if (typeof value === 'string') {
    if (/^data:[^;]+;base64,/i.test(value)) {
      const mimeType = value.slice(5, value.indexOf(';'))
      return `[${mimeType} base64 omitted]`
    }
    return value
  }
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeTraceValue(item))
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([entryKey, entryValue]) => [
        entryKey,
        sanitizeTraceValue(entryValue, entryKey),
      ]),
    )
  }
  return value
}

function normalizeError(error: unknown) {
  if (error instanceof ProviderExecutionError) return error
  if (error instanceof ProviderBoundaryError) {
    return new ProviderExecutionError(
      error.code,
      error.message,
      error.retryable,
    )
  }
  if (error instanceof Error && error.name === 'AbortError') {
    return new ProviderExecutionError('aborted', 'Node run was cancelled', false)
  }
  return new ProviderExecutionError(
    'execution_failed',
    error instanceof Error ? error.message : String(error),
    true,
  )
}

class ProviderExecutionError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly retryable: boolean,
  ) {
    super(message)
    this.name = 'ProviderExecutionError'
  }
}
