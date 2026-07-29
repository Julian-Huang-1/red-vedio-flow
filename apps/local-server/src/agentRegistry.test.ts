import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { AgentRegistry } from './agentRegistry.js'

describe('AgentRegistry model discovery', () => {
  it('persists discovered models for a registered CLI', () => {
    const dataDir = mkdtempSync(join(tmpdir(), 'rvf-agent-registry-'))
    const registry = new AgentRegistry(dataDir)
    registry.register('codex', process.execPath)

    const discovery = registry.saveModelDiscovery('codex', {
      models: [{ id: 'gpt-test', label: 'GPT Test', available: true }],
      defaultModelId: 'gpt-test',
      confidence: 'account',
    })

    expect(registry.get('codex')?.modelDiscovery).toEqual(discovery)
    expect(JSON.parse(readFileSync(join(dataDir, 'agent-cli-registry.json'), 'utf8')))
      .toMatchObject({
        agents: [{
          id: 'codex',
          modelDiscovery: {
            models: [{ id: 'gpt-test', label: 'GPT Test', available: true }],
            defaultModelId: 'gpt-test',
            confidence: 'account',
          },
        }],
      })
  })

  it('clears stale discovery when the CLI is registered again', () => {
    const dataDir = mkdtempSync(join(tmpdir(), 'rvf-agent-registry-'))
    const registry = new AgentRegistry(dataDir)
    registry.register('codex', process.execPath)
    registry.saveModelDiscovery('codex', {
      models: [{ id: 'old-model', label: 'Old model' }],
      confidence: 'cli',
    })

    registry.register('codex', process.execPath)

    expect(registry.get('codex')?.modelDiscovery).toBeUndefined()
  })
})
