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
  it('marks a workflow title change for persistence', () => {
    useWorkflowStore.getState().setWorkflowTitle('新的画布名称')

    const state = useWorkflowStore.getState()
    expect(state.workflowTitle).toBe('新的画布名称')
    expect(state.changeVersion).toBe(1)
    expect(state.toWorkflowDocument().title).toBe('新的画布名称')
  })

  it('syncs execution results without replacing local canvas state', () => {
    useWorkflowStore.getState().addNode('text')
    const localNode = useWorkflowStore.getState().nodes[0]
    useWorkflowStore.getState().selectNode(localNode.id)

    const document = useWorkflowStore.getState().toWorkflowDocument()
    document.revision = 2
    document.graph.nodes[0].data.status = 'done'
    document.graph.nodes[0].data.results = [{
      id: 'result-1',
      runId: 'run-1',
      type: 'text',
      text: '节点已完成',
      provider: { providerId: 'test' },
      createdAt: 2,
    }]
    document.graph.nodes[0].data.currentResultId = 'result-1'
    document.graph.nodes[0].data.latestRunId = 'run-1'

    useWorkflowStore.getState().syncExecutionState(document)

    const state = useWorkflowStore.getState()
    expect(state.nodes[0]).toMatchObject({
      id: localNode.id,
      selected: true,
      data: {
        status: 'done',
        currentResultId: 'result-1',
        latestRunId: 'run-1',
      },
    })
    expect(state.nodes[0].data.results).toHaveLength(1)
    expect(state.selectedNodeId).toBe(localNode.id)
  })

  it('stores the current upstream context on the target composer', () => {
    useWorkflowStore.getState().addNode('text')
    useWorkflowStore.getState().addNode('image')
    const [source, target] = useWorkflowStore.getState().nodes
    const upstreamResults = [{
      edgeId: 'edge-source-target',
      nodeId: source.id,
      resultId: 'result-source',
      resultType: 'text' as const,
      assets: [],
      text: '上游内容',
    }]

    useWorkflowStore.getState().syncComposerUpstreamResults(target.id, upstreamResults)

    expect(
      useWorkflowStore.getState().nodes[1].data.composer.upstreamResults,
    ).toEqual(upstreamResults)
  })

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
