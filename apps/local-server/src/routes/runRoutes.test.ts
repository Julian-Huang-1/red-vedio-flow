import { mkdtemp, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { describe, expect, it, vi } from 'vitest'
import type { AssetReference, StoredBlob } from '@red-video-flow/workflow-core'
import { migrateLegacyAssetInputs } from './runRoutes.js'

describe('migrateLegacyAssetInputs', () => {
  it('moves legacy local assets into BlobStorage before provider execution', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'red-video-flow-assets-'))
    const localPath = join(directory, 'reference.jpg')
    await writeFile(localPath, Buffer.from('image-bytes'))
    let sequence = 0
    const put = vi.fn(async (input: {
      fileName: string
      contentType?: string
      size?: number
    }): Promise<StoredBlob> => ({
      id: `blob-${++sequence}`,
      fileName: input.fileName,
      contentType: input.contentType,
      size: input.size ?? 0,
      sha256: 'sha',
      createdAt: Date.now(),
    }))
    const runtime = {
      backend: {
        assets: {
          resolveAssetPath: vi.fn(() => localPath),
        },
      },
      blobStorage: {
        put,
        toAssetReference: (blob: StoredBlob, kind: AssetReference['kind']) => ({
          id: blob.id,
          kind,
          url: `/api/blobs/${blob.id}`,
          name: blob.fileName,
          mimeType: blob.contentType,
          size: blob.size,
        }),
      },
    } as any
    const legacyAsset: AssetReference = {
      id: 'legacy-image',
      kind: 'image',
      url: '/api/assets/generated/run-1/reference.jpg',
      name: 'reference.jpg',
      mimeType: 'image/jpeg',
    }

    const result = await migrateLegacyAssetInputs(runtime, {
      prompt: '生成视频',
      attachments: [legacyAsset],
      upstreamResults: [{
        edgeId: 'edge-1',
        nodeId: 'image-1',
        resultId: 'result-1',
        resultType: 'image',
        assets: [legacyAsset],
      }],
      model: { providerId: 'builtin.visual-seedance', modelId: 'doubao-seedance-2' },
      generationConfig: { type: 'volc-video', version: 1 },
    }, 'user-1')

    expect(put).toHaveBeenCalledOnce()
    expect(result.attachments[0]).toMatchObject({
      id: 'blob-1',
      url: '/api/blobs/blob-1',
      mimeType: 'image/jpeg',
    })
    expect(result.upstreamResults[0].assets[0]).toMatchObject({
      id: 'blob-1',
      url: '/api/blobs/blob-1',
    })
  })
})
