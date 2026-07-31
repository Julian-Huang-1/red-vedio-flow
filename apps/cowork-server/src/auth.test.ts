import { describe, expect, it } from 'vitest'
import { parseSsoUser } from './auth.js'

describe('Cowork SSO', () => {
  it('requires Decrypted-Userinfo', () => {
    expect(() => parseSsoUser(undefined)).toThrow('SSO login is required')
  })

  it('decodes the latin1 transport representation as UTF-8 JSON', () => {
    const json = JSON.stringify({
      userId: '123',
      username: '小红书用户',
      email: 'user@example.com',
    })
    const header = Buffer.from(json, 'utf8').toString('latin1')
    expect(parseSsoUser(header)).toEqual({
      ssoId: '123',
      username: '小红书用户',
      email: 'user@example.com',
    })
  })

  it('accepts the alternate field names emitted by Cowork SSO', () => {
    const json = JSON.stringify({
      id: '123',
      displayName: '小红书用户',
      workEmail: 'user@example.com',
    })
    expect(parseSsoUser(Buffer.from(json, 'utf8').toString('latin1'))).toEqual({
      ssoId: '123',
      username: '小红书用户',
      email: 'user@example.com',
    })
  })
})
