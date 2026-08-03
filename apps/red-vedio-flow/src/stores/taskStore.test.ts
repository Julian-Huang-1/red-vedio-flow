import { beforeEach, describe, expect, it } from 'vitest'
import { projectRunEvent, useTaskStore } from './taskStore'
import { useWorkflowStore } from './workflowStore'

beforeEach(() => {
  useWorkflowStore.getState().loadWorkflow({
    schemaVersion: 1,
    id: 'workflow-video-test',
    title: 'Video test',
    revision: 1,
    createdAt: 1,
    updatedAt: 1,
    graph: { nodes: [], edges: [] },
  })
  useTaskStore.setState({ runs: {}, progress: {} })
})

describe('video provider task events', () => {
  it('keeps the node running when the provider accepts an asynchronous task', () => {
    useWorkflowStore.getState().addNode('video')
    const node = useWorkflowStore.getState().nodes[0]
    const run = useTaskStore.getState().createRun(
      'workflow-video-test',
      node.id,
      useWorkflowStore.getState().buildRunInput(node.id),
    )

    projectRunEvent(useTaskStore.setState, useTaskStore.getState, {
      type: 'provider-task',
      runId: run.id,
      taskId: 'cgt-task-1',
    })

    expect(useWorkflowStore.getState().nodes[0].data.status).toBe('running')
    expect(useTaskStore.getState().runs[run.id]).toMatchObject({
      status: 'running',
      providerTask: {
        providerId: run.inputSnapshot.model.providerId,
        taskId: 'cgt-task-1',
      },
    })
  })
})
