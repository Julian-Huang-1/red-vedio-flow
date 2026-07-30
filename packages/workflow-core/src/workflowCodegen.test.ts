import { describe, expect, it } from 'vitest'
import type { MaterialNode, WorkflowDocument } from './types'
import { collectWorkflowInputSchema, generateWorkflowModule } from './workflowCodegen'

describe('workflow code generation', () => {
  it('collects input node definitions and generates types and parallel execution', () => {
    const workflow = document([
      inputNode('topic', 'topic', 'text'),
      node('image-a', 'image'),
      node('image-b', 'image'),
      outputNode('video', 'result'),
    ], [
      ['topic', 'image-a'],
      ['topic', 'image-b'],
      ['image-a', 'video'],
      ['image-b', 'video'],
    ])
    const generated = generateWorkflowModule(workflow)
    expect(generated.inputSchema.topic).toMatchObject({
      nodeId: 'topic',
      valueType: 'text',
      required: true,
    })
    expect(generated.code).toContain('export type WorkflowInput = {')
    expect(generated.code).toContain('topic: string')
    expect(generated.code).toContain('await Promise.all([')
    expect(generated.code).toContain('upstreamResults: [node_image_a, node_image_b]')
  })

  it('rejects duplicate input keys', () => {
    const workflow = document([
      inputNode('first', 'prompt', 'text'),
      inputNode('second', 'prompt', 'text'),
    ], [])
    expect(() => collectWorkflowInputSchema(workflow)).toThrow('duplicate workflow input key')
  })

  it('generates JavaScript without TypeScript-only syntax', () => {
    const generated = generateWorkflowModule(
      document([inputNode('topic', 'topic', 'text'), outputNode('result', 'result')], [
        ['topic', 'result'],
      ]),
      { language: 'js' },
    )
    expect(generated.code).not.toContain('export type')
    expect(generated.code).not.toContain('as const')
    expect(generated.code).not.toContain('defineWorkflow<')
  })
})

function document(nodes: MaterialNode[], connections: Array<[string, string]>): WorkflowDocument {
  return {
    schemaVersion: 1,
    id: 'workflow',
    title: 'Generated workflow',
    revision: 3,
    createdAt: 1,
    updatedAt: 1,
    graph: {
      nodes,
      edges: connections.map(([source, target]) => ({ source, target })),
    },
  }
}

function inputNode(
  id: string,
  key: string,
  valueType: 'text' | 'image',
): MaterialNode {
  return {
    ...node(id, valueType),
    data: {
      ...node(id, valueType).data,
      executionMode: 'input',
      workflowInput: {
        key,
        title: key,
        valueType,
        required: true,
      },
    },
  }
}

function outputNode(id: string, label: string): MaterialNode {
  return {
    ...node(id, 'video'),
    data: {
      ...node(id, 'video').data,
      serviceRole: 'output',
      serviceLabel: label,
    },
  }
}

function node(id: string, materialType: 'text' | 'image' | 'video'): MaterialNode {
  return {
    id,
    position: { x: 0, y: 0 },
    data: {
      materialType,
      title: id,
      status: 'ready',
      value: {},
      messages: [],
    },
  }
}
