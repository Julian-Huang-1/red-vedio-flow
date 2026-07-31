import type { PostgresDatabase } from './database.js'

export type PublishedApp = {
  id: string
  ownerId: string
  title: string
  currentReleaseId?: string
  createdAt: number
  updatedAt: number
}

export type AppRelease = {
  id: string
  appId: string
  version: number
  html: string
  contentHash: string
  createdBy: string
  createdAt: number
}

export type AppCapability = {
  id: string
  appId: string
  key: string
  workflowId: string
  workflowRevision: number
  subgraphId?: string
  createdAt: number
  updatedAt: number
}

export type RuntimeSession = {
  id: string
  tokenHash: string
  userId: string
  appId: string
  releaseId: string
  expiresAt: number
  createdAt: number
  revokedAt?: number
}

export interface PublishedAppRepository {
  createApp(app: PublishedApp): Promise<PublishedApp>
  getApp(id: string): Promise<PublishedApp | undefined>
  listApps(ownerId?: string): Promise<PublishedApp[]>
  deleteApp(id: string): Promise<boolean>
  saveApp(app: PublishedApp): Promise<PublishedApp>
  createRelease(release: AppRelease): Promise<AppRelease>
  getRelease(id: string): Promise<AppRelease | undefined>
  listReleases(appId: string): Promise<AppRelease[]>
  saveCapability(capability: AppCapability): Promise<AppCapability>
  getCapability(appId: string, key: string): Promise<AppCapability | undefined>
  listCapabilities(appId: string): Promise<AppCapability[]>
  deleteCapability(appId: string, key: string): Promise<boolean>
  createRuntimeSession(session: RuntimeSession): Promise<RuntimeSession>
  getRuntimeSessionByTokenHash(tokenHash: string): Promise<RuntimeSession | undefined>
  revokeRuntimeSession(id: string, revokedAt: number): Promise<void>
  bindRuntimeRun(runId: string, sessionId: string, appId: string, createdAt: number): Promise<void>
  getRuntimeRunBinding(runId: string): Promise<{ sessionId: string; appId: string } | undefined>
}

export class PostgresPublishedAppRepository implements PublishedAppRepository {
  constructor(private readonly sql: PostgresDatabase) {}

  async createApp(app: PublishedApp) {
    await this.sql`
      INSERT INTO published_apps (id, owner_id, title, current_release_id, created_at, updated_at)
      VALUES (${app.id}, ${app.ownerId}, ${app.title}, ${app.currentReleaseId ?? null}, ${app.createdAt}, ${app.updatedAt})
    `
    return app
  }

  async getApp(id: string) {
    const rows = await this.sql`SELECT * FROM published_apps WHERE id = ${id} LIMIT 1`
    return rows[0] ? toApp(rows[0]) : undefined
  }

  async listApps(ownerId?: string) {
    const rows = ownerId
      ? await this.sql`SELECT * FROM published_apps WHERE owner_id = ${ownerId} ORDER BY updated_at DESC`
      : await this.sql`SELECT * FROM published_apps ORDER BY updated_at DESC`
    return rows.map(toApp)
  }

  async deleteApp(id: string) {
    const rows = await this.sql`DELETE FROM published_apps WHERE id = ${id} RETURNING id`
    return rows.length > 0
  }

  async saveApp(app: PublishedApp) {
    await this.sql`
      UPDATE published_apps SET
        title = ${app.title},
        current_release_id = ${app.currentReleaseId ?? null},
        updated_at = ${app.updatedAt}
      WHERE id = ${app.id}
    `
    return app
  }

  async createRelease(release: AppRelease) {
    await this.sql`
      INSERT INTO app_releases (
        id, app_id, version, html_content, content_hash, created_by, created_at
      ) VALUES (
        ${release.id}, ${release.appId}, ${release.version}, ${release.html},
        ${release.contentHash}, ${release.createdBy}, ${release.createdAt}
      )
    `
    return release
  }

  async getRelease(id: string) {
    const rows = await this.sql`SELECT * FROM app_releases WHERE id = ${id} LIMIT 1`
    return rows[0] ? toRelease(rows[0]) : undefined
  }

  async listReleases(appId: string) {
    const rows = await this.sql`
      SELECT * FROM app_releases WHERE app_id = ${appId} ORDER BY version DESC
    `
    return rows.map(toRelease)
  }

  async saveCapability(capability: AppCapability) {
    await this.sql`
      INSERT INTO app_capabilities (
        id, app_id, capability_key, workflow_id, workflow_revision, subgraph_id, created_at, updated_at
      ) VALUES (
        ${capability.id}, ${capability.appId}, ${capability.key}, ${capability.workflowId},
        ${capability.workflowRevision}, ${capability.subgraphId ?? null}, ${capability.createdAt}, ${capability.updatedAt}
      )
      ON CONFLICT (app_id, capability_key) DO UPDATE SET
        workflow_id = EXCLUDED.workflow_id,
        workflow_revision = EXCLUDED.workflow_revision,
        subgraph_id = EXCLUDED.subgraph_id,
        updated_at = EXCLUDED.updated_at
    `
    return capability
  }

  async getCapability(appId: string, key: string) {
    const rows = await this.sql`
      SELECT * FROM app_capabilities WHERE app_id = ${appId} AND capability_key = ${key} LIMIT 1
    `
    return rows[0] ? toCapability(rows[0]) : undefined
  }

  async listCapabilities(appId: string) {
    const rows = await this.sql`
      SELECT * FROM app_capabilities WHERE app_id = ${appId} ORDER BY capability_key
    `
    return rows.map(toCapability)
  }

  async deleteCapability(appId: string, key: string) {
    const rows = await this.sql`
      DELETE FROM app_capabilities WHERE app_id = ${appId} AND capability_key = ${key}
      RETURNING id
    `
    return rows.length > 0
  }

  async createRuntimeSession(session: RuntimeSession) {
    await this.sql`
      INSERT INTO runtime_sessions (
        id, token_hash, user_id, app_id, release_id, expires_at, created_at, revoked_at
      ) VALUES (
        ${session.id}, ${session.tokenHash}, ${session.userId}, ${session.appId},
        ${session.releaseId}, ${session.expiresAt}, ${session.createdAt}, ${session.revokedAt ?? null}
      )
    `
    return session
  }

  async getRuntimeSessionByTokenHash(tokenHash: string) {
    const rows = await this.sql`
      SELECT * FROM runtime_sessions WHERE token_hash = ${tokenHash} LIMIT 1
    `
    return rows[0] ? toSession(rows[0]) : undefined
  }

  async revokeRuntimeSession(id: string, revokedAt: number) {
    await this.sql`UPDATE runtime_sessions SET revoked_at = ${revokedAt} WHERE id = ${id}`
  }

  async bindRuntimeRun(runId: string, sessionId: string, appId: string, createdAt: number) {
    await this.sql`
      INSERT INTO runtime_app_runs (run_id, session_id, app_id, created_at)
      VALUES (${runId}, ${sessionId}, ${appId}, ${createdAt})
    `
  }

  async getRuntimeRunBinding(runId: string) {
    const rows = await this.sql`
      SELECT session_id, app_id FROM runtime_app_runs WHERE run_id = ${runId} LIMIT 1
    `
    return rows[0]
      ? { sessionId: String(rows[0].session_id), appId: String(rows[0].app_id) }
      : undefined
  }
}

function toApp(row: Record<string, unknown>): PublishedApp {
  return {
    id: String(row.id), ownerId: String(row.owner_id), title: String(row.title),
    currentReleaseId: row.current_release_id ? String(row.current_release_id) : undefined,
    createdAt: Number(row.created_at), updatedAt: Number(row.updated_at),
  }
}

function toRelease(row: Record<string, unknown>): AppRelease {
  return {
    id: String(row.id), appId: String(row.app_id), version: Number(row.version),
    html: String(row.html_content), contentHash: String(row.content_hash),
    createdBy: String(row.created_by), createdAt: Number(row.created_at),
  }
}

function toCapability(row: Record<string, unknown>): AppCapability {
  return {
    id: String(row.id), appId: String(row.app_id), key: String(row.capability_key),
    workflowId: String(row.workflow_id), workflowRevision: Number(row.workflow_revision),
    subgraphId: row.subgraph_id ? String(row.subgraph_id) : undefined,
    createdAt: Number(row.created_at), updatedAt: Number(row.updated_at),
  }
}

function toSession(row: Record<string, unknown>): RuntimeSession {
  return {
    id: String(row.id), tokenHash: String(row.token_hash), userId: String(row.user_id),
    appId: String(row.app_id), releaseId: String(row.release_id),
    expiresAt: Number(row.expires_at), createdAt: Number(row.created_at),
    revokedAt: row.revoked_at ? Number(row.revoked_at) : undefined,
  }
}
