import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, describe, expect, it } from 'vitest'
import type { LocalServerHandle } from './server'

const testDir = dirname(fileURLToPath(import.meta.url))
const workspaceRoot = resolve(testDir, '../../..')
const fixture = join(
  workspaceRoot,
  'packages/local-backend/src/plugins/fixtures/test-plugin.mjs',
)
const root = mkdtempSync(join(tmpdir(), 'rvf-server-plugin-'))
const pluginRoot = join(root, 'plugins')
const pluginDir = join(pluginRoot, 'test-plugin')
mkdirSync(pluginDir, { recursive: true })
writeFileSync(join(pluginDir, 'plugin.json'), JSON.stringify({
  id: 'test.plugin',
  name: 'Test Plugin',
  version: '1.0.0',
  apiVersion: '1',
  backend: {
    runtime: 'process',
    command: process.execPath,
    args: [fixture],
  },
  contributes: {
    commands: [{ id: 'test.echo', title: 'Echo' }],
  },
}))

let handle: LocalServerHandle | undefined

afterAll(async () => {
  await handle?.close()
  rmSync(root, { recursive: true, force: true })
})

describe('local-server plugin routes', () => {
  it('discovers a plugin and executes its command through the HTTP API', async () => {
    const { startLocalServer } = await import('./server')
    handle = await startLocalServer({
      preferredPort: 0,
      dataDir: join(root, 'data'),
      pluginDirs: [pluginRoot],
    })

    const pluginsResponse = await fetch(`${handle.url}/api/plugins`)
    expect(pluginsResponse.status).toBe(200)
    const plugins = (await pluginsResponse.json()) as {
      plugins: Array<{ id: string }>
    }
    expect(plugins.plugins).toEqual([
      expect.objectContaining({
        status: 'active',
        manifest: expect.objectContaining({ id: 'test.plugin' }),
      }),
    ])

    const startResponse = await fetch(`${handle.url}/api/commands/test.echo/executions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ input: { text: 'hello' } }),
    })
    expect(startResponse.status).toBe(202)
    const started = (await startResponse.json()) as {
      execution: { id: string }
    }

    const eventsResponse = await fetch(
      `${handle.url}/api/executions/${started.execution.id}/events`,
    )
    expect(eventsResponse.status).toBe(200)
    const events = await eventsResponse.text()
    expect(events).toContain('event: delta')
    expect(events).toContain('event: completed')

    const executionResponse = await fetch(
      `${handle.url}/api/executions/${started.execution.id}`,
    )
    const execution = (await executionResponse.json()) as {
      execution: { status: string }
    }
    expect(execution.execution).toEqual(expect.objectContaining({
      status: 'succeeded',
      result: {
        input: { text: 'hello' },
        tokenConfigured: false,
      },
    }))

    const missingApiResponse = await fetch(`${handle.url}/api/does-not-exist`)
    expect(missingApiResponse.status).toBe(404)
    expect(missingApiResponse.headers.get('content-type')).toContain('application/json')

    const invalidJsonResponse = await fetch(
      `${handle.url}/api/commands/test.echo/executions`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{',
      },
    )
    expect(invalidJsonResponse.status).toBe(400)
  })
})
