import { describe, expect, it } from 'vitest'
import type { MaterialNode, WorkflowEdge } from './types'
import {
  createExecutionPlan,
  validateWorkflowGraph,
  WorkflowGraphValidationError,
} from './executionPlan'

describe('workflow execution plan', () => {
  it('creates levels for a linear workflow', () => {
    expect(createExecutionPlan(graph(['a', 'b', 'c'], [
      edge('a', 'b'),
      edge('b', 'c'),
    ]))).toMatchObject({
      levels: [['a'], ['b'], ['c']],
      startNodeIds: ['a'],
      nodes: {
        a: { level: 0, dependencies: [] },
        b: { level: 1, dependencies: ['a'] },
        c: { level: 2, dependencies: ['b'] },
      },
    })
  })

  it('groups independent branches and waits at a join', () => {
    const plan = createExecutionPlan(graph(['a', 'b', 'c', 'd'], [
      edge('a', 'c'),
      edge('b', 'c'),
      edge('c', 'd'),
    ]))
    expect(plan.levels).toEqual([['a', 'b'], ['c'], ['d']])
    expect(plan.nodes.c.dependencies).toEqual(['a', 'b'])
  })

  it('treats an isolated node as both a start and a complete level', () => {
    expect(createExecutionPlan(graph(['alone'], [])).levels).toEqual([['alone']])
  })

  it('reports invalid edge references and duplicate connections', () => {
    const errors = validateWorkflowGraph(graph(['a', 'b'], [
      { id: 'one', source: 'a', target: 'b' },
      { id: 'two', source: 'a', target: 'b' },
      { id: 'missing', source: 'unknown', target: 'b' },
    ]))
    expect(errors.map((error) => error.code)).toEqual([
      'missing_source_node',
      'duplicate_edge',
    ])
  })

  it('rejects a cyclic workflow with structured errors', () => {
    const input = graph(['a', 'b', 'c'], [
      edge('a', 'b'),
      edge('b', 'c'),
      edge('c', 'a'),
    ])
    expect(validateWorkflowGraph(input)).toEqual([
      expect.objectContaining({ code: 'cycle', nodeIds: ['a', 'b', 'c'] }),
    ])
    expect(() => createExecutionPlan(input)).toThrow(WorkflowGraphValidationError)
  })
})

function graph(nodeIds: string[], edges: WorkflowEdge[]) {
  return { nodes: nodeIds.map(node), edges }
}

function node(id: string): MaterialNode {
  return {
    id,
    position: { x: 0, y: 0 },
    data: {
      materialType: 'text',
      title: id,
      status: 'ready',
      value: {},
      messages: [],
    },
  }
}

function edge(source: string, target: string): WorkflowEdge {
  return { id: `${source}-${target}`, source, target }
}
