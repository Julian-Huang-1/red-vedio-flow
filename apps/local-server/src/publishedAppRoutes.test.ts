import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import type { LocalServerHandle } from './server'

const root = mkdtempSync(join(tmpdir(), 'rvf-published-app-'))
let handle: LocalServerHandle | undefined

afterAll(async () => {
  await handle?.close()
  rmSync(root, { recursive: true, force: true })
})

describe('published app routes', () => {
  it('publishes HTML and runs the bound workflow with a short-lived runtime token', async () => {
    const { startLocalServer } = await import('./server')
    handle = await startLocalServer({ preferredPort: 0, dataDir: join(root, 'data'), pluginDirs: [] })

    const workflow = await jsonRequest<{ id: string }>(`${handle.url}/api/workflows`, {
      method: 'POST',
      body: JSON.stringify({
        title: 'Runtime workflow',
        graph: {
          nodes: [
            {
              id: 'input', position: { x: 0, y: 0 },
              data: { materialType: 'text', title: 'Input', serviceRole: 'input', serviceLabel: 'prompt', status: 'empty', value: {}, messages: [] },
            },
            {
              id: 'output', position: { x: 100, y: 0 },
              data: { materialType: 'text', title: 'Output', serviceRole: 'output', serviceLabel: 'result', status: 'empty', value: {}, messages: [] },
            },
            {
              id: 'outside', position: { x: 200, y: 0 },
              data: { materialType: 'text', title: 'Outside', status: 'empty', value: {}, messages: [] },
            },
          ],
          edges: [{ source: 'input', target: 'output' }],
          subgraphs: [{
            id: 'subgraph-video',
            name: 'Video capability',
            nodeIds: ['input', 'output'],
            createdAt: Date.now(),
            updatedAt: Date.now(),
          }],
        },
      }),
    })
    const { app } = await jsonRequest<{ app: { id: string } }>(`${handle.url}/api/apps`, {
      method: 'POST', body: JSON.stringify({ title: 'Runtime App' }),
    })
    const appList = await jsonRequest<{ apps: Array<{ id: string; title: string }> }>(
      `${handle.url}/api/apps`,
    )
    expect(appList.apps).toEqual([
      expect.objectContaining({ id: app.id, title: 'Runtime App' }),
    ])
    await jsonRequest(`${handle.url}/api/apps/${app.id}/releases`, {
      method: 'POST', body: JSON.stringify({ html: '<!doctype html><html><head></head><body>hello</body></html>' }),
    })
    const preview = await fetch(`${handle.url}/api/apps/${app.id}/preview`)
    expect(preview.status).toBe(200)
    expect(preview.headers.get('content-security-policy')).toContain("default-src 'none'")
    expect(await preview.text()).toContain('<body>hello</body>')
    await jsonRequest(`${handle.url}/api/apps/${app.id}/capabilities/default`, {
      method: 'PUT', body: JSON.stringify({ workflowId: workflow.id, workflowRevision: 1, subgraphId: 'subgraph-video' }),
    })
    const session = await jsonRequest<{ runtimeUrl: string }>(
      `${handle.url}/api/apps/${app.id}/runtime-sessions`, { method: 'POST' },
    )
    const token = new URL(session.runtimeUrl).searchParams.get('token')!
    const page = await fetch(session.runtimeUrl)
    expect(page.status).toBe(200)
    expect(page.headers.get('referrer-policy')).toBe('no-referrer')
    expect(await page.text()).toContain('window.RUNTIME_CONFIG=')

    const started = await jsonRequest<{ run: { id: string; status: string; events: Array<{ nodeId?: string }> } }>(
      `${handle.url}/api/runtime/apps/${app.id}/capabilities/default/runs`,
      { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: JSON.stringify({ inputs: { prompt: 'hello runtime' } }) },
    )
    let run = started.run
    for (let attempt = 0; attempt < 20 && !['succeeded', 'failed'].includes(run.status); attempt++) {
      await new Promise((resolve) => setTimeout(resolve, 20))
      run = (await jsonRequest<{ run: typeof run }>(
        `${handle.url}/api/runtime/apps/${app.id}/runs/${run.id}`,
        { headers: { Authorization: `Bearer ${token}` } },
      )).run
    }
    expect(run.status).toBe('succeeded')
    expect(run.events.some((event) => event.nodeId === 'outside')).toBe(false)

    const invalid = await fetch(`${handle.url}/api/runtime/apps/another-app/runs/${run.id}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    expect(invalid.status).toBe(401)
  })
})

async function jsonRequest<T = unknown>(url: string, init: RequestInit = {}) {
  const response = await fetch(url, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...init.headers },
  })
  const payload = await response.json()
  if (!response.ok) throw new Error(`${response.status}: ${JSON.stringify(payload)}`)
  return payload as T
}
