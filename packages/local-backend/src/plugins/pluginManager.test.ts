import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'
import { PluginManager } from './pluginManager'

const testDir = dirname(fileURLToPath(import.meta.url))
const fixture = join(testDir, 'fixtures/test-plugin.mjs')
const managers: PluginManager[] = []

afterEach(async () => {
  await Promise.allSettled(managers.splice(0).map((manager) => manager.close()))
})

describe('PluginManager', () => {
  it('discovers, activates and calls a process plugin without exposing secrets', async () => {
    const pluginRoot = mkdtempSync(join(tmpdir(), 'rvf-plugins-'))
    const pluginDir = join(pluginRoot, 'test-plugin')
    mkdirSync(pluginDir)
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
        backgroundWorkers: [{ id: 'test.worker', autoStart: true }],
      },
      secrets: {
        TEST_PLUGIN_TOKEN: 'do-not-expose',
      },
    }))

    const manager = new PluginManager({ pluginDirs: [pluginRoot] })
    managers.push(manager)
    const notifications: unknown[] = []
    manager.onNotification((event) => notifications.push(event))
    await manager.start()

    expect(manager.list()).toEqual([
      expect.objectContaining({
        status: 'active',
        manifest: expect.objectContaining({
          id: 'test.plugin',
          secretsConfigured: { TEST_PLUGIN_TOKEN: true },
        }),
      }),
    ])
    expect(JSON.stringify(manager.list())).not.toContain('do-not-expose')
    expect(manager.contributions.getCommand('test.echo')?.pluginId).toBe('test.plugin')
    expect(manager.contributions.getBackgroundWorker('test.worker')?.pluginId).toBe('test.plugin')
    await expect(manager.call('test.plugin', 'command.execute', {
      executionId: 'exec-1',
      input: { value: 'hi' },
    })).resolves.toEqual({
      input: { value: 'hi' },
      tokenConfigured: true,
    })
    expect(notifications).toEqual([
      expect.objectContaining({
        pluginId: 'test.plugin',
        method: 'execution.event',
      }),
    ])
    await expect(manager.call('test.plugin', 'command.execute', {
      executionId: 'exec-2',
      input: { returnToken: true },
    })).resolves.toEqual({
      input: { returnToken: true },
      tokenConfigured: true,
      token: '[REDACTED]',
    })
    expect(JSON.stringify(notifications)).not.toContain('do-not-expose')
    await expect(manager.health('test.plugin')).resolves.toEqual({ ok: true })
    await expect(manager.stopWorker('test.worker')).resolves.toEqual({ stopped: 'test.worker' })
    await expect(manager.startWorker('test.worker')).resolves.toEqual({ started: 'test.worker' })
  })

  it('keeps invalid plugins as discovery errors instead of blocking valid plugins', async () => {
    const pluginRoot = mkdtempSync(join(tmpdir(), 'rvf-plugins-'))
    const invalidDir = join(pluginRoot, 'invalid')
    mkdirSync(invalidDir)
    writeFileSync(join(invalidDir, 'plugin.json'), '{"id":')

    const manager = new PluginManager({ pluginDirs: [pluginRoot] })
    managers.push(manager)
    await manager.start()

    expect(manager.list()).toEqual([])
    expect(manager.listDiscoveryErrors()).toEqual([
      expect.objectContaining({ path: join(invalidDir, 'plugin.json') }),
    ])
  })
})
