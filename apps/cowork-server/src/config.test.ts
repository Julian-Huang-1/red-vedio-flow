import { mkdtempSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  DEFAULT_IMAGE_PROVIDER_URL,
  DEFAULT_TEXT_PROVIDER_URL,
  DEFAULT_VIDEO_PROVIDER_URL,
  readCoworkDatabase,
  resolveCoworkConfig,
} from './config.js'

describe('Cowork configuration', () => {
  it('reads only the six injected PostgreSQL fields', () => {
    const directory = mkdtempSync(join(tmpdir(), 'rvf-cowork-'))
    const path = join(directory, 'db.properties')
    writeFileSync(path, [
      'db.type=postgresql',
      'db.host=postgres.internal',
      'db.port=5432',
      'db.username=workflow',
      'db.password=p@ss:/?#word',
      'db.database=workflow',
    ].join('\n'))
    expect(readCoworkDatabase(path)).toEqual({
      host: 'postgres.internal',
      port: 5432,
      username: 'workflow',
      password: 'p@ss:/?#word',
      database: 'workflow',
    })
  })

  it('rejects db.url and other non-injected keys', () => {
    const directory = mkdtempSync(join(tmpdir(), 'rvf-cowork-'))
    const path = join(directory, 'db.properties')
    writeFileSync(path, [
      'db.type=postgresql',
      'db.host=postgres.internal',
      'db.port=5432',
      'db.username=workflow',
      'db.password=secret',
      'db.database=workflow',
      'db.url=postgresql://invalid',
    ].join('\n'))
    expect(() => readCoworkDatabase(path)).toThrow('unsupported db.properties keys: db.url')
  })

  it('uses APP_PORT and the built-in provider endpoints', () => {
    const directory = mkdtempSync(join(tmpdir(), 'rvf-cowork-'))
    writeFileSync(join(directory, 'db.properties'), [
      'db.type=postgresql',
      'db.host=postgres.internal',
      'db.port=5432',
      'db.username=workflow',
      'db.password=secret',
      'db.database=workflow',
    ].join('\n'))
    const config = resolveCoworkConfig(directory, {
      APP_PORT: '3001',
    })
    expect(config.host).toBe('0.0.0.0')
    expect(config.port).toBe(3001)
    expect(config.workerConcurrency).toBe(3)
    expect(config.textProviderUrl).toBe(DEFAULT_TEXT_PROVIDER_URL)
    expect(config.imageProviderUrl).toBe(DEFAULT_IMAGE_PROVIDER_URL)
    expect(config.videoProviderUrl).toBe(DEFAULT_VIDEO_PROVIDER_URL)
    expect(config.credentialEncryptionKey).toBe(
      createHash('sha256')
        .update('red-video-flow:credential-encryption:v1\0')
        .update('secret')
        .digest('hex'),
    )
  })

  it('allows provider endpoints to be overridden for diagnostics or migration', () => {
    const directory = mkdtempSync(join(tmpdir(), 'rvf-cowork-'))
    writeFileSync(join(directory, 'db.properties'), [
      'db.type=postgresql',
      'db.host=postgres.internal',
      'db.port=5432',
      'db.username=workflow',
      'db.password=secret',
      'db.database=workflow',
    ].join('\n'))
    const config = resolveCoworkConfig(directory, {
      APP_CREDENTIAL_ENCRYPTION_KEY: 'encryption-key',
      APP_TEXT_PROVIDER_URL: 'https://provider.example/text',
      APP_IMAGE_PROVIDER_URL: 'https://provider.example/image',
      APP_VIDEO_PROVIDER_URL: 'https://provider.example/video',
    })
    expect(config.textProviderUrl).toBe('https://provider.example/text')
    expect(config.imageProviderUrl).toBe('https://provider.example/image')
    expect(config.videoProviderUrl).toBe('https://provider.example/video')
    expect(config.credentialEncryptionKey).toBe('encryption-key')
  })
})
