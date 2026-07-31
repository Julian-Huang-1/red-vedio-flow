import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { readDatabaseProperties, resolveLocalServerConfig } from './config.js'

describe('Cowork server configuration', () => {
  it('reads the six injected db.properties fields without constructing a URL', () => {
    const directory = mkdtempSync(join(tmpdir(), 'rvf-db-properties-'))
    const path = join(directory, 'db.properties')
    writeFileSync(path, [
      'db.type=postgresql',
      'db.host=postgres.internal',
      'db.port=5432',
      'db.username=workflow_user',
      'db.password=p@ss:/?#word',
      'db.database=workflow',
    ].join('\n'))

    expect(readDatabaseProperties(path)).toEqual({
      host: 'postgres.internal',
      port: 5432,
      username: 'workflow_user',
      password: 'p@ss:/?#word',
      database: 'workflow',
    })
  })

  it('rejects keys that Cowork does not inject', () => {
    const directory = mkdtempSync(join(tmpdir(), 'rvf-db-properties-'))
    const path = join(directory, 'db.properties')
    writeFileSync(path, [
      'db.type=postgresql',
      'db.host=postgres.internal',
      'db.port=5432',
      'db.username=workflow_user',
      'db.password=secret',
      'db.database=workflow',
      'db.url=postgresql://invalid',
    ].join('\n'))

    expect(() => readDatabaseProperties(path)).toThrow('unsupported db.properties keys: db.url')
  })

  it('uses the Cowork port, host, and strict SSO contract', () => {
    const config = resolveLocalServerConfig({
      database: {
        host: 'postgres.internal',
        port: 5432,
        username: 'workflow_user',
        password: 'secret',
        database: 'workflow',
      },
    }, {
      APP_DEPLOYMENT_MODE: 'cowork',
      APP_PORT: '3001',
      APP_CREDENTIAL_ENCRYPTION_KEY: 'test-key',
    })

    expect(config.preferredPort).toBe(3001)
    expect(config.host).toBe('0.0.0.0')
    expect(config.requireSso).toBe(true)
    expect(config.deploymentMode).toBe('cowork')
  })
})
