import { describe, expect, it } from 'vitest'
import { createMaterialNode } from './nodeFactory'
import { createWorkflowContract } from './workflowContract'
import type { MaterialNode, WorkflowDocument } from './types'

function boundaryNode(
  id: string,
  type: MaterialNode['data']['materialType'],
  role: 'input' | 'output',
  label: string,
) {
  const node = createMaterialNode({
    id,
    materialType: type,
    position: { x: 0, y: 0 },
    title: id,
  })
  node.data.serviceRole = role
  node.data.serviceLabel = label
  return node
}

function workflow(nodes: MaterialNode[], edges: WorkflowDocument['graph']['edges']): WorkflowDocument {
  return {
    schemaVersion: 1,
    id: 'workflow-test',
    title: 'Test',
    revision: 3,
    createdAt: 1,
    updatedAt: 1,
    graph: { nodes, edges },
  }
}

describe('workflow contract', () => {
  it('maps ordinary material nodes to named service inputs and outputs', () => {
    const input = boundaryNode('input', 'image', 'input', 'product_image')
    const output = boundaryNode('output', 'video', 'output', 'result_video')
    const contract = createWorkflowContract(workflow(
      [input, output],
      [{ source: input.id, target: output.id }],
    ))

    expect(contract.inputs.product_image).toEqual(expect.objectContaining({
      nodeId: input.id,
      type: 'image',
      required: true,
    }))
    expect(contract.outputs.result_video).toEqual(expect.objectContaining({
      nodeId: output.id,
      type: 'video',
    }))
  })

  it('rejects duplicate labels and unreachable outputs', () => {
    const first = boundaryNode('first', 'text', 'input', 'prompt')
    const second = boundaryNode('second', 'text', 'input', 'prompt')
    const output = boundaryNode('output', 'video', 'output', 'video')
    expect(() => createWorkflowContract(workflow(
      [first, second, output],
      [{ source: first.id, target: output.id }],
    ))).toThrow('duplicate input label')

    second.data.serviceLabel = 'other'
    expect(() => createWorkflowContract(workflow(
      [first, second, output],
      [],
    ))).toThrow('not reachable')
  })
})
