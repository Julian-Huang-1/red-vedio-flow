import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { PiAgentService } from '@red-video-flow/local-server/pi-agent-service'
type Entry = { service: PiAgentService }

export class CoworkPiAgentManager {
  private readonly entries = new Map<string, Entry>()

  constructor(
    private readonly cwd: string,
    private readonly token: string,
  ) {}

  async forUser(userId: string) {
    const current = this.entries.get(userId)
    if (current) return current.service
    const service = new PiAgentService(
      this.cwd,
      join(tmpdir(), 'red-video-flow-cowork-pi-agent', userId),
      this.token,
    )
    this.entries.set(userId, { service })
    return service
  }

  async close() {
    await Promise.all([...this.entries.values()].map(({ service }) => service.close()))
    this.entries.clear()
  }
}
