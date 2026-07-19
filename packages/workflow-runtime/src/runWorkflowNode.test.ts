import { describe, expect, it, vi } from 'vitest'
import { createMaterialNode, type MaterialNode } from '@red-video-flow/workflow-core'
import { fallbackGenerate, runWorkflowNode } from './runWorkflowNode'

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

describe('runWorkflowNode', () => {
  it('generates local text output with upstream context when no agent is selected', async () => {
    const result = await runWorkflowNode(
      {
        node: node('target', 'text'),
        upstream: [node('source', 'text', '上游提示')],
        edges: [{ source: 'source', target: 'target' }],
        prompt: '扩写',
      },
      {
        runTextAgent: vi.fn(),
        runVisualModel: vi.fn(),
      },
    )

    expect(result.status).toBe('done')
    expect(result.value.text).toContain('扩写')
    expect(result.value.text).toContain('上游提示')
  })

  it('returns visual model asset metadata for image and video nodes', async () => {
    const result = await runWorkflowNode(
      {
        node: node('image', 'image'),
        upstream: [],
        edges: [],
        prompt: '生成图片',
      },
      {
        runTextAgent: vi.fn(),
        runVisualModel: vi.fn().mockResolvedValue({
          submitId: 'submit-1',
          url: '/api/assets/generated/image.png',
          fileName: 'image.png',
          mimeType: 'image/png',
        }),
      },
    )

    expect(result.status).toBe('done')
    expect(result.value).toMatchObject({
      provider: 'dreamina',
      submitId: 'submit-1',
      url: '/api/assets/generated/image.png',
    })
  })

  it('falls back to local text when a selected agent throws', async () => {
    const result = await runWorkflowNode(
      {
        node: node('target', 'text'),
        upstream: [],
        edges: [],
        prompt: '写一句话',
        selectedAgent: {
          id: 'agent-1',
          label: 'Agent One',
          vendor: 'test',
          protocol: 'cli',
          available: true,
          invokable: true,
          fallbackModels: [],
        },
      },
      {
        runTextAgent: vi.fn().mockRejectedValue(new Error('agent failed')),
        runVisualModel: vi.fn(),
      },
    )

    expect(result.status).toBe('done')
    expect(result.value.text).toContain(fallbackGenerate('写一句话', []))
    expect(result.value.text).toContain('agent failed')
  })
})
