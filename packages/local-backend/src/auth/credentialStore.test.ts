import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { createLocalBackend, type LocalBackend } from '../context'

let backend: LocalBackend | undefined
let dataDir: string | undefined

afterEach(() => {
  backend?.database.sqlite.close()
  if (dataDir) rmSync(dataDir, { recursive: true, force: true })
  backend = undefined
  dataDir = undefined
})

describe('model credentials', () => {
  it('encrypts one shared token per SSO user and only exposes a fingerprint', async () => {
    dataDir = mkdtempSync(join(tmpdir(), 'rvf-credential-'))
    backend = createLocalBackend({
      dataDir,
      credentialEncryptionKey: 'test-only-encryption-key',
    })
    const user = await backend.users.upsertFromSso({
      ssoId: 'sso-1',
      username: 'tester',
      email: 'tester@example.com',
    })
    const token = 'provider-secret-token-1234'

    const status = await backend.credentials.setModelToken(user.id, token)

    expect(status.configured).toBe(true)
    expect(status.maskedToken).toContain('****1234')
    expect(status.maskedToken).not.toContain(token)
    expect(await backend.credentials.getModelToken(user.id)).toBe(token)
    expect(readFileSync(join(dataDir, 'red-video-flow.sqlite')).toString('latin1')).not.toContain(token)
  })
})
