import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { FileBlobStorage } from './fileBlobStorage.js'

const directories: string[] = []

afterEach(() => {
  for (const directory of directories.splice(0)) {
    rmSync(directory, { recursive: true, force: true })
  }
})

describe('FileBlobStorage', () => {
  it('persists owner-scoped blobs and supports byte ranges', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'rvf-file-blobs-'))
    directories.push(directory)
    const storage = new FileBlobStorage(directory)
    const blob = await storage.put({
      ownerId: 'user-1',
      fileName: 'video.mp4',
      contentType: 'video/mp4',
      body: (async function* () {
        yield Buffer.from('0123456789')
      })(),
    })

    expect(await storage.statForOwner(blob.id, 'user-2')).toBeUndefined()
    expect(await storage.statForOwner(blob.id, 'user-1')).toEqual(blob)
    const chunks: Buffer[] = []
    for await (
      const chunk of await storage.readForOwner(
        blob.id,
        'user-1',
        { start: 2, end: 5 },
      )
    ) {
      chunks.push(Buffer.from(chunk))
    }
    expect(Buffer.concat(chunks).toString()).toBe('2345')
    expect(storage.toAssetReference(blob, 'video')).toEqual({
      id: blob.id,
      kind: 'video',
      url: `/api/blobs/${blob.id}`,
      name: 'video.mp4',
      mimeType: 'video/mp4',
      size: 10,
    })
  })
})
