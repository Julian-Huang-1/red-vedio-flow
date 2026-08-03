import { randomUUID } from 'node:crypto'
import type {
  NodeResult,
  NodeRun,
  NodeRunInput,
  NodeRunTrace,
  ProviderExecutionEvent,
} from '@red-video-flow/workflow-core'
import type { PostgresWorkflowRun } from '@red-video-flow/postgres-backend'
import type { DurableRuntime } from './runtime.js'

export async function createNodeRun(
  runtime: DurableRuntime,
  input: {
    id?: string
    userId: string
    workflowId: string
    nodeId: string
    input: NodeRunInput
  },
) {
  if (input.id) {
    const existing = await runtime.infrastructure.workflowRuns.get(input.id)
    if (existing) return toNodeRun(existing)
  }
  const workflow = await runtime.infrastructure.postgresWorkflows.get(input.workflowId)
  if (!workflow) throw new Error(`workflow not found: ${input.workflowId}`)
  const node = workflow.graph.nodes.find((item) => item.id === input.nodeId)
  if (!node) throw new Error(`node not found: ${input.nodeId}`)
  const now = Date.now()
  const run: PostgresWorkflowRun = {
    id: input.id ?? randomUUID(),
    userId: input.userId,
    workflowId: input.workflowId,
    nodeId: input.nodeId,
    kind: node.data.materialType,
    status: 'queued',
    prompt: input.input.prompt,
    inputSnapshot: input.input,
    resultIds: [],
    createdAt: now,
    updatedAt: now,
    startedAt: now,
    heartbeatAt: now,
    trace: {
      runId: input.id ?? '',
      nodeId: input.nodeId,
      providerId: input.input.model.providerId,
      modelId: input.input.model.modelId,
      composer: input.input,
      startedAt: now,
    },
  }
  run.trace!.runId = run.id
  await runtime.infrastructure.workflowRuns.save(run)
  await appendRunEvent(runtime, run.id, 'run', { type: 'run', status: 'queued', runId: run.id })
  return toNodeRun(run)
}

export async function appendRunEvent(
  runtime: DurableRuntime,
  runId: string,
  type: string,
  data: unknown,
) {
  return runtime.infrastructure.workflowRuns.appendEvent(runId, type, data)
}

export async function updateTrace(
  runtime: DurableRuntime,
  runId: string,
  patch: Partial<NodeRunTrace>,
) {
  const run = await requireRun(runtime, runId)
  const now = Date.now()
  const trace = { ...(run.trace ?? patch), ...patch } as NodeRunTrace
  await runtime.infrastructure.workflowRuns.save({
    ...run,
    trace,
    updatedAt: now,
    heartbeatAt: now,
  })
  return trace
}

export async function emitProviderEvent(
  runtime: DurableRuntime,
  runId: string,
  event: ProviderExecutionEvent,
) {
  if (event.type === 'provider-task') {
    const run = await requireRun(runtime, runId)
    await runtime.infrastructure.workflowRuns.save({
      ...run,
      providerTaskId: event.taskId,
      updatedAt: Date.now(),
      heartbeatAt: Date.now(),
    })
  }
  if (event.type === 'text-delta') {
    await appendRunEvent(runtime, runId, 'text_delta', {
      type: 'text_delta',
      runId,
      delta: event.delta,
    })
    return
  }
  await appendRunEvent(runtime, runId, event.type, { ...event, runId })
}

export async function completeNodeRun(
  runtime: DurableRuntime,
  runId: string,
  results: NodeResult[],
  providerTaskId?: string,
  providerResponseId?: string,
) {
  const run = await requireRun(runtime, runId)
  const now = Date.now()
  const finishedTrace = run.trace
    ? { ...run.trace, finishedAt: now, durationMs: now - run.trace.startedAt }
    : undefined
  await runtime.infrastructure.workflowRuns.save({
    ...run,
    status: 'succeeded',
    providerTaskId,
    providerResponseId,
    resultIds: results.map((result) => result.id),
    result: results,
    trace: finishedTrace,
    error: undefined,
    errorCode: undefined,
    errorRetryable: undefined,
    updatedAt: now,
    heartbeatAt: now,
    finishedAt: now,
  })
  for (const result of results) {
    await appendRunEvent(runtime, runId, 'result', { type: 'result', runId, result })
  }
  await appendRunEvent(runtime, runId, 'done', {
    type: 'done',
    runId,
    resultIds: results.map((result) => result.id),
  })
}

export async function failNodeRun(
  runtime: DurableRuntime,
  runId: string,
  error: { code?: string; message: string; retryable: boolean },
) {
  const run = await requireRun(runtime, runId)
  if (!['queued', 'running'].includes(run.status)) return
  const now = Date.now()
  await runtime.infrastructure.workflowRuns.save({
    ...run,
    status: 'failed',
    error: error.message,
    errorCode: error.code,
    errorRetryable: error.retryable,
    trace: run.trace
      ? {
          ...run.trace,
          error: error.message,
          finishedAt: now,
          durationMs: now - run.trace.startedAt,
        }
      : undefined,
    updatedAt: now,
    heartbeatAt: now,
    finishedAt: now,
  })
  await appendRunEvent(runtime, runId, 'error', { type: 'error', runId, ...error })
}

export async function cancelNodeRun(runtime: DurableRuntime, runId: string) {
  const run = await requireRun(runtime, runId)
  if (!['queued', 'running'].includes(run.status)) return toNodeRun(run)
  const now = Date.now()
  const next = {
    ...run,
    status: 'cancelled' as const,
    updatedAt: now,
    heartbeatAt: now,
    finishedAt: now,
  }
  await runtime.infrastructure.workflowRuns.save(next)
  await appendRunEvent(runtime, runId, 'error', {
    type: 'error',
    runId,
    code: 'cancelled',
    message: 'run cancelled',
    retryable: false,
  })
  return toNodeRun(next)
}

export async function requireRun(runtime: DurableRuntime, id: string) {
  const run = await runtime.infrastructure.workflowRuns.get(id)
  if (!run?.inputSnapshot) throw new Error(`node run not found: ${id}`)
  return run
}

export function toNodeRun(run: PostgresWorkflowRun): NodeRun {
  return {
    id: run.id,
    userId: run.userId,
    workflowId: run.workflowId,
    nodeId: run.nodeId,
    status: normalizeStatus(run.status),
    inputSnapshot: run.inputSnapshot!,
    providerTask: run.providerId
      ? {
          providerId: run.providerId,
          taskId: run.providerTaskId,
          responseId: run.providerResponseId,
        }
      : undefined,
    resultIds: run.resultIds ?? [],
    error: run.error
      ? { code: run.errorCode, message: run.error, retryable: run.errorRetryable ?? false }
      : undefined,
    createdAt: run.createdAt ?? run.startedAt,
    updatedAt: run.updatedAt,
    startedAt: run.startedAt,
    finishedAt: run.finishedAt,
    trace: run.trace,
  }
}

function normalizeStatus(status: PostgresWorkflowRun['status']): NodeRun['status'] {
  if (status === 'done') return 'succeeded'
  if (status === 'error') return 'failed'
  if (status === 'timeout') return 'timed_out'
  return status
}
