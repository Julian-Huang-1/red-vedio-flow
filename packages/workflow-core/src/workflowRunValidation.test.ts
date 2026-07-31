import { describe, expect, it } from 'vitest'
import { createDefaultComposer } from './generationTypes'
import type { MaterialNode, WorkflowDocument } from './types'
import { validateWorkflowForRun } from './workflowRunValidation'

describe('validateWorkflowForRun', () => {
  it('rejects an isolated generate node without effective input', () => {
    const workflow = documentWith([node('text')])
    const validation = validateWorkflowForRun(workflow)

    expect(validation.valid).toBe(false)
    expect(validation.issues).toContainEqual(expect.objectContaining({
      code: 'node_input_empty',
      nodeId: 'text',
    }))
  })

  it('accepts an empty prompt when the node has an upstream dependency', () => {
    const input = node('input', 'input')
    input.data.workflowInput = {
      key: 'topic',
      title: '主题',
      valueType: 'text',
      required: true,
    }
    const workflow = documentWith(
      [input, node('text')],
      [{ id: 'input-text', source: 'input', target: 'text' }],
    )

    expect(validateWorkflowForRun(workflow, { topic: '夏日海边' }).valid).toBe(true)
  })

  it('returns a node issue for an incomplete composer', () => {
    const target = node('image')
    target.data.composer = {} as MaterialNode['data']['composer']

    const validation = validateWorkflowForRun(documentWith([target]))

    expect(validation.issues).toContainEqual(expect.objectContaining({
      code: 'composer_model_missing',
      nodeId: 'image',
    }))
  })
})

function node(id: string, executionMode: 'input' | 'generate' = 'generate'): MaterialNode {
  return {
    id,
    position: { x: 0, y: 0 },
    data: {
      materialType: id === 'image' ? 'image' : 'text',
      title: id,
      executionMode,
      status: 'ready',
      value: {},
      messages: [],
      composer: createDefaultComposer(id === 'image' ? 'image' : 'text'),
    },
  }
}

function documentWith(
  nodes: MaterialNode[],
  edges: WorkflowDocument['graph']['edges'] = [],
): WorkflowDocument {
  return {
    schemaVersion: 1,
    id: 'workflow',
    title: 'Workflow',
    revision: 1,
    createdAt: 1,
    updatedAt: 1,
    graph: { nodes, edges },
  }
}
