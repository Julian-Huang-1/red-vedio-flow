import { randomUUID } from 'node:crypto'
import {
  chmodSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { dirname } from 'node:path'

export type RuntimeInfo = {
  version: 1
  port: number
  baseUrl: string
  instanceId: string
  pid: number
  startedAt: string
}

export class RuntimeInfoStore {
  readonly instanceId = randomUUID()
  readonly startedAt = new Date().toISOString()
  private current?: RuntimeInfo

  constructor(private readonly filePath: string) {}

  get() {
    return this.current
  }

  publish(port: number, baseUrl: string) {
    const info: RuntimeInfo = {
      version: 1,
      port,
      baseUrl,
      instanceId: this.instanceId,
      pid: process.pid,
      startedAt: this.startedAt,
    }
    mkdirSync(dirname(this.filePath), { recursive: true })
    const temporaryPath = `${this.filePath}.${process.pid}.tmp`
    writeFileSync(temporaryPath, `${JSON.stringify(info, null, 2)}\n`, { mode: 0o600 })
    chmodSync(temporaryPath, 0o600)
    renameSync(temporaryPath, this.filePath)
    this.current = info
    return info
  }

  clear() {
    this.current = undefined
    try {
      const persisted = JSON.parse(readFileSync(this.filePath, 'utf8'))
      if (persisted?.instanceId === this.instanceId) rmSync(this.filePath, { force: true })
    } catch {}
  }
}
