import { randomBytes } from 'node:crypto'
import { HttpError } from './http.js'

type RegistrationGrant = {
  agentId: string
  expiresAt: number
}

export class AgentRegistrationTokens {
  private readonly grants = new Map<string, RegistrationGrant>()

  create(agentId: string, ttlMs = 5 * 60_000) {
    this.prune()
    const token = randomBytes(32).toString('base64url')
    const expiresAt = Date.now() + ttlMs
    this.grants.set(token, { agentId, expiresAt })
    return {
      token,
      agentId,
      expiresAt: new Date(expiresAt).toISOString(),
    }
  }

  assert(token: string, agentId: string) {
    this.prune()
    const grant = this.grants.get(token)
    if (!grant || grant.agentId !== agentId) {
      throw new HttpError(401, 'invalid or expired agent registration token')
    }
  }

  consume(token: string, agentId: string) {
    this.assert(token, agentId)
    this.grants.delete(token)
  }

  private prune() {
    const now = Date.now()
    for (const [token, grant] of this.grants) {
      if (grant.expiresAt <= now) this.grants.delete(token)
    }
  }
}
