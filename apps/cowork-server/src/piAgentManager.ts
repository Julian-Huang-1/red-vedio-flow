import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { PiAgentService } from '@red-video-flow/local-server/pi-agent-service'
import type { PostgresCredentialStore } from '@red-video-flow/postgres-backend'
import { HttpError } from './http.js'

type Entry = { token: string; service: PiAgentService }

export class CoworkPiAgentManager {
  private readonly entries = new Map<string, Entry>()

  constructor(
    private readonly cwd: string,
    private readonly credentials: PostgresCredentialStore,
  ) {}

  async forUser(userId: string) {
    const token = await this.credentials.getModelToken(userId)
    if (!token) throw new HttpError(400, '请先在模型设置中配置 Token')
    const current = this.entries.get(userId)
    if (current?.token === token) return current.service
    if (current) await current.service.close()
    const service = new PiAgentService(
      this.cwd,
      join(tmpdir(), 'red-video-flow-cowork-pi-agent', userId),
      token,
    )
    this.entries.set(userId, { token, service })
    return service
  }

  async close() {
    await Promise.all([...this.entries.values()].map(({ service }) => service.close()))
    this.entries.clear()
  }
}
