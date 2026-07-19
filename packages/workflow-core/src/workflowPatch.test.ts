import { describe, expect, it } from 'vitest'
import { applyWorkflowPatch } from './workflowPatch'
import { canConnect, canConnectMaterialNodes } from './graphRules'
import { createMaterialNode } from './nodeFactory'
import type { MaterialNode, WorkflowDocument } from './types'

function node(id: string, materialType: MaterialNode['data']['materialType'], text?: string) {
  const item = createMaterialNode({
    id,
    materialType,
    position: { x: 0, y: 0 },
    title: id,
  })
  if (text) {
    item.data.status = 'ready'
    item.data.value = { text }
  }
  return item
}

function document(nodes: MaterialNode[] = []): WorkflowDocument {
  return {
    schemaVersion: 1,
    id: 'workflow-1',
    title: 'Workflow',
    revision: 1,
    createdAt: 1,
    updatedAt: 1,
    graph: { nodes, edges: [] },
  }
}

describe('graph rules', () => {
  it('allows only supported material transitions', () => {
    expect(canConnect('text', 'video')).toBe(true)
    expect(canConnect('image', 'video')).toBe(true)
    expect(canConnect('video', 'image')).toBe(false)
  })

  it('requires a source value and enforces target material type even when target is empty', () => {
    const source = node('video-source', 'video')
    const target = node('image-target', 'image')

    expect(canConnectMaterialNodes(source, target)).toBe(false)

    source.data.status = 'ready'
    source.data.value = { url: '/video.mp4' }

    expect(canConnectMaterialNodes(source, target)).toBe(false)
    expect(canConnectMaterialNodes(source, node('video-target', 'video'))).toBe(true)
  })
})

describe('applyWorkflowPatch', () => {
  it('adds, updates, and removes nodes with connected edges', () => {
    const text = node('text-1', 'text', 'prompt')
    const image = node('image-1', 'image')

    const patched = applyWorkflowPatch(document([text]), [
      { type: 'addNode', node: image },
      { type: 'addEdge', edge: { id: 'edge-1', source: text.id, target: image.id } },
      { type: 'setNodeValue', nodeId: image.id, value: { url: '/image.png' } },
      { type: 'setNodeStatus', nodeId: image.id, status: 'done' },
    ])

    expect(patched.graph.edges).toHaveLength(1)
    expect(patched.graph.nodes.find((item) => item.id === image.id)?.data).toMatchObject({
      status: 'done',
      value: { url: '/image.png' },
    })

    const withoutText = applyWorkflowPatch(patched, [{ type: 'removeNode', nodeId: text.id }])
    expect(withoutText.graph.nodes.map((item) => item.id)).toEqual([image.id])
    expect(withoutText.graph.edges).toEqual([])
  })

  it('rejects invalid edges and stale removals', () => {
    const video = node('video-1', 'video')
    video.data.status = 'ready'
    video.data.value = { url: '/video.mp4' }

    expect(() =>
      applyWorkflowPatch(document([video, node('image-1', 'image')]), [
        { type: 'addEdge', edge: { source: video.id, target: 'image-1' } },
      ]),
    ).toThrow('edge violates material connection rules')

    expect(() => applyWorkflowPatch(document(), [{ type: 'removeEdge', edgeId: 'missing' }])).toThrow('edge not found')
  })
})
