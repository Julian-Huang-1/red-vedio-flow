import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import type { LocalServerHandle } from './server'

const root = mkdtempSync(join(tmpdir(), 'rvf-workflow-app-'))
let handle: LocalServerHandle | undefined

afterAll(async () => {
  await handle?.close()
  rmSync(root, { recursive: true, force: true })
})

describe('workflow app routes', () => {
  it('creates a contract and runs a text-only workflow by labels', async () => {
    const { startLocalServer } = await import('./server')
    handle = await startLocalServer({
      preferredPort: 0,
      dataDir: join(root, 'data'),
      pluginDirs: [],
    })

    const createResponse = await fetch(`${handle.url}/api/workflows`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: 'Text App',
        graph: {
          nodes: [
            {
              id: 'input',
              position: { x: 0, y: 0 },
              data: {
                materialType: 'text',
                title: 'Input',
                serviceRole: 'input',
                serviceLabel: 'prompt',
                status: 'empty',
                value: {},
                messages: [],
              },
            },
            {
              id: 'output',
              position: { x: 100, y: 0 },
              data: {
                materialType: 'text',
                title: 'Output',
                serviceRole: 'output',
                serviceLabel: 'result',
                status: 'empty',
                value: {},
                messages: [],
              },
            },
          ],
          edges: [{ source: 'input', target: 'output' }],
        },
      }),
    })
    const workflow = await createResponse.json() as { id: string }

    const contractResponse = await fetch(
      `${handle.url}/api/workflows/${workflow.id}/contract`,
    )
    expect(contractResponse.status).toBe(200)
    const contract = await contractResponse.json() as {
      contract: { inputs: Record<string, unknown>; outputs: Record<string, unknown> }
    }
    expect(Object.keys(contract.contract.inputs)).toEqual(['prompt'])
    expect(Object.keys(contract.contract.outputs)).toEqual(['result'])

    const codeResponse = await fetch(
      `${handle.url}/api/workflows/${workflow.id}/code?language=ts`,
    )
    expect(codeResponse.status).toBe(200)
    const generated = await codeResponse.json() as { code: string }
    expect(generated.code).toContain('export type WorkflowInput = {')
    expect(generated.code).toContain('prompt: string')

    const startResponse = await fetch(
      `${handle.url}/api/workflows/${workflow.id}/runs`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ inputs: { prompt: 'hello app' } }),
      },
    )
    expect(startResponse.status).toBe(202)
    let run = (await startResponse.json() as {
      run: { id: string; status: string; outputs?: { result?: { text?: string } }; error?: string }
    }).run
    for (let attempt = 0; attempt < 20 && !['succeeded', 'failed'].includes(run.status); attempt++) {
      await new Promise((resolve) => setTimeout(resolve, 20))
      run = (await (await fetch(`${handle.url}/api/workflow-runs/${run.id}`)).json() as {
        run: typeof run
      }).run
    }
    expect(run.status, run.error).toBe('succeeded')
    expect(run.outputs?.result?.text).toBe('hello app')

    const history = await (
      await fetch(`${handle.url}/api/workflows/${workflow.id}/runs`)
    ).json() as { runs: Array<{ id: string; status: string }> }
    expect(history.runs).toEqual([
      expect.objectContaining({ id: run.id, status: 'succeeded' }),
    ])

    await handle.close()
    handle = await startLocalServer({
      preferredPort: 0,
      dataDir: join(root, 'data'),
      pluginDirs: [],
    })
    const restored = await (
      await fetch(`${handle.url}/api/workflow-runs/${run.id}`)
    ).json() as { run: { id: string; status: string } }
    expect(restored.run).toEqual(
      expect.objectContaining({ id: run.id, status: 'succeeded' }),
    )
  })
})
