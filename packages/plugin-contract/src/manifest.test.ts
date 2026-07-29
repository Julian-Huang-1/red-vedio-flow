import { describe, expect, it } from 'vitest'
import {
  parsePluginManifest,
  redactPluginSecrets,
  redactPluginValue,
  sanitizePluginManifest,
} from './manifest'

describe('plugin manifest', () => {
  it('parses contributions and removes secrets from public descriptors', () => {
    const manifest = parsePluginManifest({
      id: 'example.kling',
      name: 'Kling',
      version: '1.0.0',
      apiVersion: '1',
      backend: { runtime: 'process', command: 'node', args: ['main.js'] },
      contributes: {
        commands: [{ id: 'kling.generate', title: 'Generate' }],
        visualProviders: [{
          id: 'kling',
          title: 'Kling',
          capabilities: ['text-to-video'],
        }],
      },
      secrets: { KLING_TOKEN: 'secret-value' },
    })

    expect(manifest.contributes?.commands?.[0].id).toBe('kling.generate')
    expect(sanitizePluginManifest(manifest)).toEqual(expect.objectContaining({
      id: 'example.kling',
      secretsConfigured: { KLING_TOKEN: true },
    }))
    expect(JSON.stringify(sanitizePluginManifest(manifest))).not.toContain('secret-value')
    expect(redactPluginSecrets('failed with secret-value', manifest)).toBe('failed with [REDACTED]')
    expect(redactPluginValue({
      nested: ['secret-value', { error: 'token=secret-value' }],
    }, manifest)).toEqual({
      nested: ['[REDACTED]', { error: 'token=[REDACTED]' }],
    })
  })

  it('rejects incompatible api versions and duplicate contribution ids', () => {
    expect(() => parsePluginManifest({
      id: 'example.test',
      name: 'Test',
      version: '1.0.0',
      apiVersion: '2',
      backend: { runtime: 'process', command: 'node' },
    })).toThrow('unsupported plugin apiVersion')

    expect(() => parsePluginManifest({
      id: 'example.test',
      name: 'Test',
      version: '1.0.0',
      apiVersion: '1',
      backend: { runtime: 'process', command: 'node' },
      contributes: {
        commands: [{ id: 'same.id', title: 'One' }],
        backgroundWorkers: [{ id: 'same.id' }],
      },
    })).not.toThrow()

    expect(() => parsePluginManifest({
      id: 'example.test',
      name: 'Test',
      version: '1.0.0',
      apiVersion: '1',
      backend: { runtime: 'process', command: 'node' },
      contributes: {
        commands: [
          { id: 'same.id', title: 'One' },
          { id: 'same.id', title: 'Two' },
        ],
      },
    })).toThrow('duplicate commands contribution id')
  })
})
