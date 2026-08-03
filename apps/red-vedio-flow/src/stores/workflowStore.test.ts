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
  it('duplicates a complete subgraph with remapped nodes, edges, and capability targets', () => {
    useWorkflowStore.getState().addNode('image')
    useWorkflowStore.getState().addNode('video')
    const [sourceNode, targetNode] = useWorkflowStore.getState().nodes
    useWorkflowStore.getState().connectNodes({
      source: sourceNode.id,
      target: targetNode.id,
      sourceHandle: null,
      targetHandle: null,
    })
    const sourceSubgraph = useWorkflowStore.getState().createSubgraph([sourceNode.id, targetNode.id])!
    useWorkflowStore.getState().setSubgraphCapability(sourceSubgraph.id, {
      inputs: [{
        label: 'input_1',
        target: { nodeId: sourceNode.id, kind: 'composer' },
        valueType: 'text',
        required: true,
      }],
      outputs: [{
        label: 'output_1',
        target: { nodeId: targetNode.id, kind: 'node' },
        valueType: 'video',
      }],
    })

    const duplicateId = useWorkflowStore.getState().duplicateSubgraph(sourceSubgraph.id)
    const state = useWorkflowStore.getState()
    const duplicate = state.subgraphs.find((item) => item.id === duplicateId)!

    expect(duplicate.name).toBe(`${sourceSubgraph.name} 副本`)
    expect(duplicate.position).toEqual({
      x: (sourceSubgraph.position?.x ?? 0) + 48,
      y: (sourceSubgraph.position?.y ?? 0) + 48,
    })
    expect(duplicate.nodeIds).toHaveLength(2)
    expect(duplicate.nodeIds.every((id) => !sourceSubgraph.nodeIds.includes(id))).toBe(true)
    expect(state.edges).toHaveLength(2)
    expect(state.edges[1]).toMatchObject({
      source: duplicate.nodeIds[0],
      target: duplicate.nodeIds[1],
    })
    expect(duplicate.capability?.inputs[0].target.nodeId).toBe(duplicate.nodeIds[0])
    expect(duplicate.capability?.outputs[0].target.nodeId).toBe(duplicate.nodeIds[1])
  })

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

  it('stores node and composer capability labels on a subgraph', () => {
    useWorkflowStore.getState().addNode('text')
    const nodeId = useWorkflowStore.getState().nodes[0].id
    const subgraph = useWorkflowStore.getState().createSubgraph([nodeId])!

    useWorkflowStore.getState().toggleSubgraphCapabilityLabel(
      subgraph.id,
      nodeId,
      'node',
      'input',
      'text',
    )
    useWorkflowStore.getState().toggleSubgraphCapabilityLabel(
      subgraph.id,
      nodeId,
      'composer',
      'output',
      'text',
    )

    expect(useWorkflowStore.getState().subgraphs[0].capability).toEqual({
      inputs: [{
        label: 'input_1',
        target: { nodeId, kind: 'node' },
        valueType: 'text',
        required: true,
      }],
      outputs: [{
        label: 'output_1',
        target: { nodeId, kind: 'composer' },
        valueType: 'text',
      }],
    })
  })

  it('keeps only one input target per node in the first protocol version', () => {
    useWorkflowStore.getState().addNode('image')
    const nodeId = useWorkflowStore.getState().nodes[0].id
    const subgraph = useWorkflowStore.getState().createSubgraph([nodeId])!

    useWorkflowStore.getState().toggleSubgraphCapabilityLabel(subgraph.id, nodeId, 'node', 'input', 'image')
    useWorkflowStore.getState().toggleSubgraphCapabilityLabel(subgraph.id, nodeId, 'composer', 'input', 'image')

    expect(useWorkflowStore.getState().subgraphs[0].capability?.inputs).toEqual([{
      label: 'input_1',
      target: { nodeId, kind: 'composer' },
      valueType: 'text',
      required: true,
    }])
  })

  it('duplicates a complete card and keeps it in the same subgraph', () => {
    useWorkflowStore.getState().addNode('text')
    const source = useWorkflowStore.getState().nodes[0]
    useWorkflowStore.getState().updateComposer(source.id, { prompt: '保留这段 Composer 内容' })
    useWorkflowStore.getState().appendResult(source.id, {
      id: 'result-source',
      runId: 'run-source',
      type: 'text',
      text: '已有生成结果',
      provider: { providerId: 'test' },
      createdAt: 1,
    })
    const subgraph = useWorkflowStore.getState().createSubgraph([source.id])!
    useWorkflowStore.getState().toggleSubgraphCapabilityLabel(subgraph.id, source.id, 'node', 'output', 'text')

    const duplicateId = useWorkflowStore.getState().duplicateNode(source.id)!
    const state = useWorkflowStore.getState()
    const duplicate = state.nodes.find((node) => node.id === duplicateId)!

    expect(duplicate.id).not.toBe(source.id)
    expect(duplicate.data.composer.prompt).toBe('保留这段 Composer 内容')
    expect(duplicate.data.results).toMatchObject([{ id: 'result-source', text: '已有生成结果' }])
    expect(duplicate.position).toEqual({
      x: state.nodes.find((node) => node.id === source.id)!.position.x + 40,
      y: state.nodes.find((node) => node.id === source.id)!.position.y + 40,
    })
    expect(state.subgraphs[0].nodeIds).toContain(duplicateId)
    expect(state.subgraphs[0].capability?.outputs).toEqual(expect.arrayContaining([
      expect.objectContaining({ label: 'output_2', target: { nodeId: duplicateId, kind: 'node' } }),
    ]))
    expect(state.selectedNodeId).toBe(duplicateId)
  })

  it('creates audio as an input-only node', () => {
    useWorkflowStore.getState().addNode('audio', 'input')

    expect(useWorkflowStore.getState().nodes[0]).toMatchObject({
      data: {
        kind: 'audio',
        title: '音频输入',
        executionMode: 'input',
        workflowInput: {
          valueType: 'audio',
          required: true,
        },
      },
    })
  })
})
