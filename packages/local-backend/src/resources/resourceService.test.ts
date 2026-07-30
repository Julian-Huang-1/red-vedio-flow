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

describe('ResourceService', () => {
  it('indexes uploaded files and manages text resources and bindings', () => {
    dataDir = mkdtempSync(join(tmpdir(), 'rvf-resource-test-'))
    const backend = createLocalBackend({ dataDir })
    const uploaded = backend.assets.upload({
      workflowId: 'workflow-1',
      fileName: 'reference.png',
      mimeType: 'image/png',
      bytes: Buffer.from('image'),
    })
    const text = backend.resources.createText({
      workspaceId: 'workflow-1',
      name: '分镜文本',
      text: '第一幕',
      source: 'generated',
    })
    backend.resources.bind({
      resourceId: uploaded.id,
      workflowId: 'workflow-1',
      nodeId: 'image-node',
      relation: 'attachment',
    })

    expect(backend.resources.list({ workspaceId: 'workflow-1' })).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: uploaded.id, kind: 'image', source: 'upload' }),
        expect.objectContaining({ id: text.id, kind: 'text', text: '第一幕' }),
      ]),
    )
    expect(backend.resources.bindings(uploaded.id)).toEqual([
      expect.objectContaining({ nodeId: 'image-node', relation: 'attachment' }),
    ])

    backend.resources.softDelete(text.id)
    expect(backend.resources.get(text.id)).toBeUndefined()
    backend.database.sqlite.close()
  })
})
