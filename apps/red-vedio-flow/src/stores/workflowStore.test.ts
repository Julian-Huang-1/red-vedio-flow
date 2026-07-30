import { beforeEach, describe, expect, it } from 'vitest'
import { useWorkflowStore } from './workflowStore'

beforeEach(() => {
  useWorkflowStore.getState().loadWorkflow({
    schemaVersion: 1,
    id: 'history-test',
    title: 'History test',
    revision: 1,
    createdAt: 1,
    updatedAt: 1,
    graph: { nodes: [], edges: [] },
  })
})

describe('workflow history', () => {
  it('undoes and redoes node state including selection', () => {
    useWorkflowStore.getState().addNode('text')
    const nodeId = useWorkflowStore.getState().nodes[0].id
    useWorkflowStore.getState().selectNode(nodeId)

    expect(useWorkflowStore.getState().selectedNodeId).toBe(nodeId)

    useWorkflowStore.getState().undo()
    expect(useWorkflowStore.getState().selectedNodeId).toBeUndefined()
    expect(useWorkflowStore.getState().nodes).toHaveLength(1)

    useWorkflowStore.getState().undo()
    expect(useWorkflowStore.getState().nodes).toHaveLength(0)

    useWorkflowStore.getState().redo()
    useWorkflowStore.getState().redo()
    expect(useWorkflowStore.getState().nodes).toHaveLength(1)
    expect(useWorkflowStore.getState().selectedNodeId).toBe(nodeId)
  })

  it('restores a deleted selected edge', () => {
    useWorkflowStore.getState().addNode('text')
    useWorkflowStore.getState().addNode('image')
    const [source, target] = useWorkflowStore.getState().nodes
    useWorkflowStore.getState().connectNodes({
      source: source.id,
      target: target.id,
      sourceHandle: null,
      targetHandle: null,
    })
    const edgeId = useWorkflowStore.getState().edges[0].id
    useWorkflowStore.getState().onEdgesChange([{ type: 'select', id: edgeId, selected: true }])
    useWorkflowStore.getState().onEdgesChange([{ type: 'remove', id: edgeId }])

    expect(useWorkflowStore.getState().edges).toHaveLength(0)
    useWorkflowStore.getState().undo()
    expect(useWorkflowStore.getState().edges).toMatchObject([{ id: edgeId, selected: true }])
  })
})
