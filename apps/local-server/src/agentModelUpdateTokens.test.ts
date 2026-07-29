import { describe, expect, it } from 'vitest'
import { AgentModelUpdateTokens } from './agentModelUpdateTokens.js'

describe('AgentModelUpdateTokens', () => {
  it('scopes a one-time token to one agent', () => {
    const tokens = new AgentModelUpdateTokens()
    const grant = tokens.create('codex')

    expect(() => tokens.assert(grant.token, 'claude')).toThrow(
      'invalid or expired agent model update token',
    )
    expect(() => tokens.consume(grant.token, 'codex')).not.toThrow()
    expect(() => tokens.assert(grant.token, 'codex')).toThrow(
      'invalid or expired agent model update token',
    )
  })

  it('rejects expired tokens', () => {
    const tokens = new AgentModelUpdateTokens()
    const grant = tokens.create('codex', -1)

    expect(() => tokens.assert(grant.token, 'codex')).toThrow(
      'invalid or expired agent model update token',
    )
  })
})
