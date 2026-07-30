import { create } from 'zustand'
import type { NodeRun, NodeRunInput } from '@red-video-flow/workflow-core'

type TaskStore = {
  runs: Record<string, NodeRun>
  createRun: (workflowId: string, nodeId: string, input: NodeRunInput) => NodeRun
  markRunning: (runId: string, providerTask?: NodeRun['providerTask']) => void
  markSucceeded: (runId: string, resultIds: string[]) => void
  markFailed: (runId: string, error: NodeRun['error']) => void
  cancelRun: (runId: string) => void
}

export const useTaskStore = create<TaskStore>((set, get) => ({
  runs: {},
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
    set({ runs: { ...get().runs, [run.id]: run } })
    return run
  },
  markRunning: (runId, providerTask) => {
    updateRun(set, get, runId, {
      status: 'running',
      providerTask,
      startedAt: Date.now(),
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
    updateRun(set, get, runId, {
      status: 'failed',
      error,
      finishedAt: Date.now(),
    })
  },
  cancelRun: (runId) => {
    updateRun(set, get, runId, {
      status: 'cancelled',
      finishedAt: Date.now(),
    })
  },
}))

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
