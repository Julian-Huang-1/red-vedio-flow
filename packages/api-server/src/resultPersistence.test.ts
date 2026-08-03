import { describe, expect, it, vi } from 'vitest'
import type { NodeResult } from '@red-video-flow/workflow-core'
import { persistGeneratedResultResources } from './resultPersistence.js'

describe('generated resource persistence', () => {
  it('uses stable resource ids when the same run is recovered', async () => {
    const savedIds: string[] = []
    const resources = {
      save: vi.fn(async (resource: { id: string }) => {
        savedIds.push(resource.id)
        return resource
      }),
      bind: vi.fn(async (input: { resourceId: string }) => ({
        id: `binding:${input.resourceId}`,
        ...input,
        relation: 'generated' as const,
        workflowId: 'workflow-1',
        createdAt: Date.now(),
      })),
    }
    const result: NodeResult = {
      id: 'result-1',
      runId: 'run-1',
      type: 'video',
      video: {
        id: 'blob-1',
        kind: 'video',
        url: '/api/blobs/blob-1',
      },
      provider: { providerId: 'seedance' },
      createdAt: Date.now(),
    }
    const input = {
      resources: resources as any,
      workflowId: 'workflow-1',
      nodeId: 'node-1',
      runId: 'run-1',
    }

    await persistGeneratedResultResources({ ...input, results: [structuredClone(result)] })
    await persistGeneratedResultResources({ ...input, results: [structuredClone(result)] })

    expect(savedIds).toHaveLength(2)
    expect(savedIds[0]).toBe(savedIds[1])
    expect(savedIds[0]).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-a[0-9a-f]{3}-[0-9a-f]{12}$/)
  })
})
