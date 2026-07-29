import { accessSync, constants, existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { isAbsolute, join } from 'node:path'
import { spawn } from 'node:child_process'
import { HttpError } from './http.js'

export type RegisteredAgentCli = {
  id: string
  binPath: string
  registeredAt: string
  modelDiscovery?: StoredAgentModelDiscovery
}

export type StoredAgentModelDiscovery = {
  models: Array<{ id: string; label: string; available?: boolean }>
  defaultModelId?: string
  confidence: 'account' | 'cli' | 'inferred' | 'unknown'
  discoveredAt: string
  warning?: string
}

type RegistryDocument = {
  version: 1
  agents: RegisteredAgentCli[]
}

export class AgentRegistry {
  private readonly filePath: string

  constructor(dataDir: string) {
    this.filePath = join(dataDir, 'agent-cli-registry.json')
  }

  list() {
    return this.read().agents
  }

  get(id: string) {
    return this.list().find((agent) => agent.id === id)
  }

  register(id: string, binPath: string) {
    validateAgentId(id)
    validateExecutablePath(binPath)
    const document = this.read()
    const registered: RegisteredAgentCli = {
      id,
      binPath,
      registeredAt: new Date().toISOString(),
    }
    document.agents = [
      ...document.agents.filter((agent) => agent.id !== id),
      registered,
    ].sort((left, right) => left.id.localeCompare(right.id))
    this.write(document)
    return registered
  }

  saveModelDiscovery(id: string, discovery: Omit<StoredAgentModelDiscovery, 'discoveredAt'>) {
    const document = this.read()
    const index = document.agents.findIndex((agent) => agent.id === id)
    if (index === -1) throw new HttpError(404, `registered agent not found: ${id}`)
    const stored = { ...discovery, discoveredAt: new Date().toISOString() }
    document.agents[index] = { ...document.agents[index], modelDiscovery: stored }
    this.write(document)
    return stored
  }

  unregister(id: string) {
    validateAgentId(id)
    const document = this.read()
    const removed = document.agents.find((agent) => agent.id === id)
    if (!removed) throw new HttpError(404, `registered agent not found: ${id}`)
    document.agents = document.agents.filter((agent) => agent.id !== id)
    this.write(document)
    return removed
  }

  async verify(id: string, timeoutMs = 3_000) {
    const registered = this.get(id)
    if (!registered) throw new HttpError(404, `registered agent not found: ${id}`)
    if (!Number.isFinite(timeoutMs) || timeoutMs <= 0 || timeoutMs > 60_000) {
      throw new HttpError(400, 'timeoutMs must be between 1 and 60000')
    }
    validateExecutablePath(registered.binPath)
    return await probeVersion(registered, timeoutMs)
  }

  private read(): RegistryDocument {
    if (!existsSync(this.filePath)) return { version: 1, agents: [] }
    try {
      const value = JSON.parse(readFileSync(this.filePath, 'utf8'))
      if (!value || value.version !== 1 || !Array.isArray(value.agents)) throw new Error()
      return {
        version: 1,
        agents: value.agents.filter(isRegisteredAgentCli),
      }
    } catch {
      throw new Error(`agent CLI registry is invalid: ${this.filePath}`)
    }
  }

  private write(document: RegistryDocument) {
    const temporaryPath = `${this.filePath}.tmp`
    writeFileSync(temporaryPath, `${JSON.stringify(document, null, 2)}\n`, { mode: 0o600 })
    renameSync(temporaryPath, this.filePath)
  }
}

function validateAgentId(id: string) {
  if (!/^[a-z0-9][a-z0-9._-]*$/i.test(id)) {
    throw new HttpError(400, `invalid agent id: ${id}`)
  }
}

function validateExecutablePath(binPath: string) {
  if (!isAbsolute(binPath)) throw new HttpError(400, 'agent CLI path must be absolute')
  try {
    accessSync(binPath, constants.F_OK | constants.X_OK)
  } catch {
    throw new HttpError(400, `agent CLI path is not executable: ${binPath}`)
  }
}

function isRegisteredAgentCli(value: unknown): value is RegisteredAgentCli {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const record = value as Record<string, unknown>
  return typeof record.id === 'string'
    && typeof record.binPath === 'string'
    && typeof record.registeredAt === 'string'
}

function probeVersion(agent: RegisteredAgentCli, timeoutMs: number) {
  return new Promise<{
    id: string
    binPath: string
    verified: boolean
    exitCode: number | null
    version: string
  }>((resolve, reject) => {
    const child = spawn(agent.binPath, ['--version'], {
      shell: false,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let output = ''
    const append = (chunk: Buffer | string) => {
      if (output.length < 16_384) output += String(chunk).slice(0, 16_384 - output.length)
    }
    child.stdout.on('data', append)
    child.stderr.on('data', append)
    const timer = setTimeout(() => {
      child.kill('SIGTERM')
      reject(new HttpError(408, `agent CLI verification timed out: ${agent.id}`))
    }, timeoutMs)
    timer.unref()
    child.on('error', (error) => {
      clearTimeout(timer)
      reject(new HttpError(400, `failed to start agent CLI: ${error.message}`))
    })
    child.on('close', (exitCode) => {
      clearTimeout(timer)
      resolve({
        id: agent.id,
        binPath: agent.binPath,
        verified: exitCode === 0,
        exitCode,
        version: output.trim(),
      })
    })
  })
}
