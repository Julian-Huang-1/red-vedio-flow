import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import type { LocalServerHandle } from './server'

const root = mkdtempSync(join(tmpdir(), 'rvf-default-models-'))
let handle: LocalServerHandle | undefined

afterAll(async () => {
  await handle?.close()
  rmSync(root, { recursive: true, force: true })
})

describe('default model routes', () => {
  it('returns the built-in MAAS models and configured API key', async () => {
    const { startLocalServer } = await import('./server')
    handle = await startLocalServer({
      preferredPort: 0,
      dataDir: join(root, 'data'),
      pluginDirs: [],
      maasApiKey: 'test-maas-key',
    })

    const response = await fetch(`${handle.url}/api/default-models`)

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      models: [
        {
          name: 'GPT-5.6 Sol',
          baseUrl: 'https://maas.devops.rednote.life/hackson',
          model: 'GPT-5.6 Sol',
          apiKey: 'test-maas-key',
        },
        {
          name: 'Claude Sonnet 5',
          baseUrl: 'https://maas.devops.rednote.life/hackson',
          model: 'Claude Sonnet 5',
          apiKey: 'test-maas-key',
        },
        {
          name: 'claude opus 4.8',
          baseUrl: 'https://maas.devops.rednote.life/hackson',
          model: 'claude opus 4.8',
          apiKey: 'test-maas-key',
        },
      ],
    })
  }, 15_000)
})
