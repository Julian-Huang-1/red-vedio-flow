import { create } from 'zustand'
import type {
  NodeRun,
  NodeRunInput,
  WorkflowRunValidationIssue,
} from '@red-video-flow/workflow-core'
import {
  cancelWorkflowAppRun,
  cancelWorkflowNodeRun,
  createWorkflowAppRun,
  executeWorkflowNodeRun,
  fetchWorkflow,
  fetchWorkflowAppRun,
  fetchWorkflowAppRuns,
  fetchWorkflowNodeRuns,
  subscribeWorkflowNodeRun,
  type WorkflowAppRun,
  type WorkflowNodeRunEvent,
  WorkflowClientResponseError,
} from '@red-video-flow/workflow-client'
import { useWorkflowStore } from './workflowStore'
import { queryClient } from '@/lib/queryClient'
import { persistCurrentWorkflow } from '@/lib/workflowPersistence'

type RunProgress = {
  text: string
  partialImages: Record<number, string>
}

type TaskStore = {
  runs: Record<string, NodeRun>
  progress: Record<string, RunProgress>
  workflowRun?: WorkflowAppRun
  workflowValidationIssues: WorkflowRunValidationIssue[]
  workflowRunError?: string
  submitNode: (nodeId: string) => Promise<NodeRun | undefined>
  runWorkflow: (inputs?: Record<string, unknown>) => Promise<void>
  cancelWorkflow: () => Promise<void>
  restoreWorkflowRuns: (workflowId: string) => Promise<void>
  createRun: (workflowId: string, nodeId: string, input: NodeRunInput) => NodeRun
  markRunning: (runId: string, providerTask?: NodeRun['providerTask']) => void
  markSucceeded: (runId: string, resultIds: string[]) => void
  markFailed: (runId: string, error: NodeRun['error']) => void
  cancelRun: (runId: string) => void
}

const runAbortControllers = new Map<string, AbortController>()

export const useTaskStore = create<TaskStore>((set, get) => ({
  runs: {},
  progress: {},
  workflowRun: undefined,
  workflowValidationIssues: [],
  workflowRunError: undefined,
  runWorkflow: async (inputs = {}) => {
    set({ workflowValidationIssues: [], workflowRunError: undefined })
    try {
      await persistCurrentWorkflow()
      let workflow = useWorkflowStore.getState()
      let response
      try {
        response = await createWorkflowAppRun(
          workflow.workflowId,
          inputs,
          workflow.revision,
        )
      } catch (error) {
        if (
          !(error instanceof WorkflowClientResponseError)
          || error.status !== 409
          || useWorkflowStore.getState().changeVersion
        ) {
          throw error
        }
        const latest = await fetchWorkflow(workflow.workflowId)
        useWorkflowStore.getState().loadWorkflow(latest)
        workflow = useWorkflowStore.getState()
        response = await createWorkflowAppRun(
          workflow.workflowId,
          inputs,
          workflow.revision,
        )
      }
      const { run } = response
      set({ workflowRun: run })
      await pollWorkflowAppRun(run.id, workflow.workflowId, set)
    } catch (error) {
      if (error instanceof WorkflowClientResponseError && error.status === 422) {
        const payload = asValidationPayload(error.payload)
        set({
          workflowValidationIssues: payload?.issues ?? [],
          workflowRunError: payload?.message ?? error.message,
        })
        return
      }
      set({ workflowRunError: error instanceof Error ? error.message : String(error) })
    }
  },
  cancelWorkflow: async () => {
    const runId = get().workflowRun?.id
    if (!runId) return
    const { run } = await cancelWorkflowAppRun(runId)
    set({ workflowRun: run })
  },
  submitNode: async (nodeId) => {
    const workflow = useWorkflowStore.getState()
    const input = workflow.buildRunInput(nodeId)
    if (!input.prompt.trim()) return undefined
    workflow.syncComposerUpstreamResults(nodeId, input.upstreamResults)

    const run = get().createRun(workflow.workflowId, nodeId, input)
    workflow.setLatestRun(nodeId, run.id)
    workflow.setNodeStatus(nodeId, 'running')
    const abortController = new AbortController()
    runAbortControllers.set(run.id, abortController)

    try {
      await executeWorkflowNodeRun(
        {
          runId: run.id,
          workflowId: workflow.workflowId,
          nodeId,
          input,
        },
        {
          signal: abortController.signal,
          onEvent: (event) => projectRunEvent(set, get, event),
        },
      )
    } catch (error) {
      const status = get().runs[run.id]?.status
      if (status === 'queued' || status === 'running') {
        await get().restoreWorkflowRuns(workflow.workflowId).catch(() => undefined)
        const recovered = get().runs[run.id]?.status
        if (recovered === 'queued' || recovered === 'running') return get().runs[run.id]
      }
      const finalStatus = get().runs[run.id]?.status
      if (finalStatus !== 'cancelled' && finalStatus !== 'failed') {
        useWorkflowStore.getState().setNodeStatus(nodeId, 'error')
        get().markFailed(run.id, {
          code: errorCode(error),
          message: error instanceof Error ? error.message : String(error),
          retryable: errorRetryable(error),
        })
      }
    } finally {
      runAbortControllers.delete(run.id)
    }
    return get().runs[run.id]
  },
  restoreWorkflowRuns: async (workflowId) => {
    const [{ runs }, { runs: workflowRuns }] = await Promise.all([
      fetchWorkflowNodeRuns(workflowId),
      fetchWorkflowAppRuns(workflowId),
    ])
    const progress = { ...get().progress }
    for (const run of runs) progress[run.id] ??= { text: '', partialImages: {} }
    set({
      runs: Object.fromEntries(runs.map((run) => [run.id, run])),
      progress,
      workflowRun: workflowRuns[0],
    })
    if (workflowRuns[0] && ['queued', 'running'].includes(workflowRuns[0].status)) {
      void pollWorkflowAppRun(workflowRuns[0].id, workflowId, set)
    }
    for (const run of runs.filter((item) => item.status === 'queued' || item.status === 'running')) {
      if (runAbortControllers.has(run.id)) continue
      const abortController = new AbortController()
      runAbortControllers.set(run.id, abortController)
      void subscribeWorkflowNodeRun(run.id, {
        signal: abortController.signal,
        onEvent: (event) => projectRunEvent(set, get, event),
      }).catch((error) => {
        if (!abortController.signal.aborted) console.error('恢复节点任务事件流失败', error)
      }).finally(() => runAbortControllers.delete(run.id))
    }
  },
  createRun: (workflowId, nodeId, inputSnapshot) => {
    const now = Date.now()
    const run: NodeRun = {
      id: `run-${now}-${Math.random().toString(36).slice(2, 8)}`,
      workflowId,
      nodeId,
      status: 'queued',
      inputSnapshot,
      resultIds: [],
      createdAt: now,
    }
    set({
      runs: { ...get().runs, [run.id]: run },
      progress: {
        ...get().progress,
        [run.id]: { text: '', partialImages: {} },
      },
    })
    return run
  },
  markRunning: (runId, providerTask) => {
    updateRun(set, get, runId, {
      status: 'running',
      providerTask: providerTask ?? get().runs[runId]?.providerTask,
      startedAt: get().runs[runId]?.startedAt ?? Date.now(),
    })
  },
  markSucceeded: (runId, resultIds) => {
    updateRun(set, get, runId, {
      status: 'succeeded',
      resultIds,
      finishedAt: Date.now(),
    })
  },
  markFailed: (runId, error) => {
    console.log(runId, error)
    updateRun(set, get, runId, {
      status: 'failed',
      error,
      finishedAt: Date.now(),
    })
  },
  cancelRun: (runId) => {
    runAbortControllers.get(runId)?.abort()
    const nodeId = get().runs[runId]?.nodeId
    if (nodeId) useWorkflowStore.getState().setNodeStatus(nodeId, 'ready')
    updateRun(set, get, runId, {
      status: 'cancelled',
      finishedAt: Date.now(),
    })
    void cancelWorkflowNodeRun(runId).catch((error) => {
      console.error('取消节点任务失败', error)
    })
  },
}))

function asValidationPayload(payload: unknown) {
  if (!payload || typeof payload !== 'object') return undefined
  const value = payload as Record<string, unknown>
  if (!Array.isArray(value.issues)) return undefined
  return {
    message: typeof value.message === 'string' ? value.message : undefined,
    issues: value.issues as WorkflowRunValidationIssue[],
  }
}

async function pollWorkflowAppRun(
  runId: string,
  workflowId: string,
  set: (patch: Partial<TaskStore>) => void,
) {
  let executionFingerprint = ''
  while (true) {
    const latest = (await fetchWorkflowAppRun(runId)).run
    set({ workflowRun: latest })
    const nextFingerprint = Object.entries(latest.nodeStates)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([nodeId, state]) => `${nodeId}:${state.status}:${state.resultIds.join(',')}`)
      .join('|')
    if (nextFingerprint !== executionFingerprint) {
      executionFingerprint = nextFingerprint
      const document = await fetchWorkflow(workflowId)
      useWorkflowStore.getState().syncExecutionState(document)
    }
    if (!['queued', 'running'].includes(latest.status)) {
      if (latest.status === 'succeeded') {
        const document = await fetchWorkflow(workflowId)
        useWorkflowStore.getState().syncExecutionState(document)
      }
      return
    }
    await new Promise((resolve) => window.setTimeout(resolve, 250))
  }
}

function projectRunEvent(
  set: (state: Partial<TaskStore>) => void,
  get: () => TaskStore,
  event: WorkflowNodeRunEvent,
) {
  if (event.type === 'run') {
    if (event.status === 'running') {
      useWorkflowStore.getState().syncRevision(event.workflowRevision)
      useWorkflowStore.getState().setNodeStatus(
        get().runs[event.runId]?.nodeId ?? '',
        'running',
      )
      get().markRunning(event.runId, event.providerTask)
    }
    return
  }
  if (event.type === 'text_delta') {
    const current = get().progress[event.runId] ?? { text: '', partialImages: {} }
    set({
      progress: {
        ...get().progress,
        [event.runId]: { ...current, text: current.text + event.delta },
      },
    })
    return
  }
  if (event.type === 'image_partial') {
    const current = get().progress[event.runId] ?? { text: '', partialImages: {} }
    set({
      progress: {
        ...get().progress,
        [event.runId]: {
          ...current,
          partialImages: {
            ...current.partialImages,
            [event.index]: `data:image/png;base64,${event.base64}`,
          },
        },
      },
    })
    return
  }
  if (event.type === 'result') {
    useWorkflowStore.getState().appendResult(
      get().runs[event.runId]?.nodeId ?? '',
      event.result,
    )
    return
  }
  if (event.type === 'done') {
    useWorkflowStore.getState().syncRevision(event.workflowRevision)
    useWorkflowStore.getState().setNodeStatus(
      get().runs[event.runId]?.nodeId ?? '',
      'done',
    )
    get().markSucceeded(event.runId, event.resultIds)
    void queryClient.invalidateQueries({ queryKey: ['resources'] })
    return
  }
  useWorkflowStore.getState().syncRevision(event.workflowRevision)
  useWorkflowStore.getState().setNodeStatus(
    get().runs[event.runId]?.nodeId ?? '',
    'error',
  )
  get().markFailed(event.runId, {
    code: event.code,
    message: event.message,
    retryable: event.retryable,
  })
}

function updateRun(
  set: (state: Partial<TaskStore>) => void,
  get: () => TaskStore,
  runId: string,
  patch: Partial<NodeRun>,
) {
  const run = get().runs[runId]
  if (!run) return
  set({ runs: { ...get().runs, [runId]: { ...run, ...patch } } })
}

function errorCode(error: unknown) {
  return typeof error === 'object' && error && 'code' in error
    ? String(error.code)
    : undefined
}

function errorRetryable(error: unknown) {
  return typeof error === 'object' && error && 'retryable' in error
    ? Boolean(error.retryable)
    : true
}
