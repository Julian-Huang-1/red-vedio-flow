import type {
  AppCapability,
  AppRelease,
  PublishedApp,
  PublishedAppRepository,
  RuntimeSession,
} from '@red-video-flow/postgres-backend'

export class MemoryPublishedAppRepository implements PublishedAppRepository {
  private readonly apps = new Map<string, PublishedApp>()
  private readonly releases = new Map<string, AppRelease>()
  private readonly capabilities = new Map<string, AppCapability>()
  private readonly sessions = new Map<string, RuntimeSession>()
  private readonly runBindings = new Map<string, { sessionId: string; appId: string }>()

  async createApp(app: PublishedApp) {
    this.apps.set(app.id, structuredClone(app))
    return app
  }

  async getApp(id: string) {
    return clone(this.apps.get(id))
  }

  async listApps(ownerId: string) {
    return [...this.apps.values()]
      .filter((app) => app.ownerId === ownerId)
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .map((app) => structuredClone(app))
  }

  async saveApp(app: PublishedApp) {
    this.apps.set(app.id, structuredClone(app))
    return app
  }

  async createRelease(release: AppRelease) {
    this.releases.set(release.id, structuredClone(release))
    return release
  }

  async getRelease(id: string) {
    return clone(this.releases.get(id))
  }

  async listReleases(appId: string) {
    return [...this.releases.values()]
      .filter((release) => release.appId === appId)
      .sort((a, b) => b.version - a.version)
      .map((release) => structuredClone(release))
  }

  async saveCapability(capability: AppCapability) {
    this.capabilities.set(capabilityId(capability.appId, capability.key), structuredClone(capability))
    return capability
  }

  async getCapability(appId: string, key: string) {
    return clone(this.capabilities.get(capabilityId(appId, key)))
  }

  async listCapabilities(appId: string) {
    return [...this.capabilities.values()]
      .filter((capability) => capability.appId === appId)
      .sort((a, b) => a.key.localeCompare(b.key))
      .map((capability) => structuredClone(capability))
  }

  async deleteCapability(appId: string, key: string) {
    return this.capabilities.delete(capabilityId(appId, key))
  }

  async createRuntimeSession(session: RuntimeSession) {
    this.sessions.set(session.tokenHash, structuredClone(session))
    return session
  }

  async getRuntimeSessionByTokenHash(tokenHash: string) {
    return clone(this.sessions.get(tokenHash))
  }

  async revokeRuntimeSession(id: string, revokedAt: number) {
    for (const [tokenHash, session] of this.sessions) {
      if (session.id === id) this.sessions.set(tokenHash, { ...session, revokedAt })
    }
  }

  async bindRuntimeRun(runId: string, sessionId: string, appId: string) {
    this.runBindings.set(runId, { sessionId, appId })
  }

  async getRuntimeRunBinding(runId: string) {
    return clone(this.runBindings.get(runId))
  }
}

function capabilityId(appId: string, key: string) {
  return `${appId}:${key}`
}

function clone<T>(value: T | undefined): T | undefined {
  return value === undefined ? undefined : structuredClone(value)
}
