import { randomUUID } from 'node:crypto'
import type {
  AppUser,
  AuthenticatedUser,
  UserRepository as UserRepositoryContract,
} from '@red-video-flow/workflow-core'
import type { PostgresDatabase } from './database.js'

export class PostgresUserRepository implements UserRepositoryContract {
  constructor(private readonly sql: PostgresDatabase) {}

  async upsertFromSso(user: AuthenticatedUser): Promise<AppUser> {
    const now = Date.now()
    const rows = await this.sql`
      INSERT INTO app_users (id, sso_id, username, email, created_at, updated_at)
      VALUES (${randomUUID()}, ${user.ssoId}, ${user.username}, ${user.email}, ${now}, ${now})
      ON CONFLICT (sso_id) DO UPDATE SET
        username = EXCLUDED.username,
        email = EXCLUDED.email,
        updated_at = EXCLUDED.updated_at
      RETURNING id, sso_id, username, email, created_at, updated_at
    `
    return toUser(rows[0])
  }

  async getById(id: string) {
    const rows = await this.sql`
      SELECT id, sso_id, username, email, created_at, updated_at
      FROM app_users WHERE id = ${id} LIMIT 1
    `
    return rows[0] ? toUser(rows[0]) : undefined
  }
}

function toUser(row: Record<string, unknown>): AppUser {
  return {
    id: String(row.id),
    ssoId: String(row.sso_id),
    username: String(row.username),
    email: String(row.email),
    createdAt: Number(row.created_at),
    updatedAt: Number(row.updated_at),
  }
}
