import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { createLocalBackend } from '../context.js'

let dataDir: string | undefined

afterEach(() => {
  if (dataDir) rmSync(dataDir, { recursive: true, force: true })
  dataDir = undefined
})

describe('AssetService workflow isolation', () => {
  it('lists only assets belonging to the requested workflow', () => {
    dataDir = mkdtempSync(join(tmpdir(), 'rvf-asset-test-'))
    const backend = createLocalBackend({ dataDir })
    backend.assets.upload({
      workflowId: 'workflow-a',
      fileName: 'a.png',
      mimeType: 'image/png',
      bytes: Buffer.from('a'),
    })
    backend.assets.upload({
      workflowId: 'workflow-b',
      fileName: 'b.mp4',
      mimeType: 'video/mp4',
      bytes: Buffer.from('b'),
    })

    expect(backend.assets.list('workflow-a').map((asset) => asset.fileName)).toEqual(['a.png'])
    expect(backend.assets.list('workflow-b').map((asset) => asset.fileName)).toEqual(['b.mp4'])
    backend.database.sqlite.close()
  })
})
