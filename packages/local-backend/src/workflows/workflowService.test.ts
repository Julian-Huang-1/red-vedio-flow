import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { createMaterialNode } from '@red-video-flow/workflow-core'
import { createLocalBackend, type LocalBackend } from '../context'

let backend: LocalBackend | undefined
let dataDir: string | undefined

function createBackend() {
  dataDir = mkdtempSync(join(tmpdir(), 'red-video-flow-test-'))
  backend = createLocalBackend({ dataDir })
  return backend
}

afterEach(() => {
  backend?.database.sqlite.close()
  backend = undefined
  if (dataDir) rmSync(dataDir, { recursive: true, force: true })
  dataDir = undefined
})

describe('WorkflowService', () => {
  it('creates, lists, patches, and deletes workflows', () => {
    const localBackend = createBackend()
    const workflow = localBackend.workflows.create({ title: 'Test workflow' })
    const textNode = createMaterialNode({
      id: 'text-1',
      materialType: 'text',
      position: { x: 10, y: 20 },
      title: 'Text node',
    })

    const patched = localBackend.workflows.patch({
      id: workflow.id,
      baseRevision: workflow.revision,
      ops: [
        { type: 'addNode', node: textNode },
        { type: 'setNodeValue', nodeId: textNode.id, value: { text: 'hello' } },
        { type: 'setNodeStatus', nodeId: textNode.id, status: 'ready' },
      ],
    })

    expect(patched.revision).toBe(workflow.revision + 1)
    expect(localBackend.workflows.list()).toHaveLength(1)
    expect(localBackend.workflows.get(workflow.id)?.graph.nodes[0].data.value.text).toBe('hello')

    localBackend.workflows.delete(workflow.id)
    expect(localBackend.workflows.get(workflow.id)).toBeUndefined()
  })

  it('rejects stale patch revisions', () => {
    const localBackend = createBackend()
    const workflow = localBackend.workflows.create()

    localBackend.workflows.patch({
      id: workflow.id,
      baseRevision: workflow.revision,
      ops: [{ type: 'setWorkflowTitle', title: 'Updated' }],
    })

    expect(() =>
      localBackend.workflows.patch({
        id: workflow.id,
        baseRevision: workflow.revision,
        ops: [{ type: 'setWorkflowTitle', title: 'Stale' }],
      }),
    ).toThrow('workflow revision conflict')
  })
})
