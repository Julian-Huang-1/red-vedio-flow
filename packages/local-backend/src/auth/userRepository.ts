import { randomUUID } from 'node:crypto'
import { eq } from 'drizzle-orm'
import type {
  AppUser,
  AuthenticatedUser,
  UserRepository as UserRepositoryContract,
} from '@red-video-flow/workflow-core'
import type { LocalDatabase } from '../db/client.js'
import { appUsers } from '../db/schema.js'

export class UserRepository implements UserRepositoryContract {
  constructor(private readonly database: LocalDatabase) {}

  async upsertFromSso(user: AuthenticatedUser): Promise<AppUser> {
    const existing = this.database.db
      .select()
      .from(appUsers)
      .where(eq(appUsers.ssoId, user.ssoId))
      .get()
    const now = Date.now()
    const value = {
      id: existing?.id ?? randomUUID(),
      ssoId: user.ssoId,
      username: user.username,
      email: user.email,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    }
    this.database.db
      .insert(appUsers)
      .values(value)
      .onConflictDoUpdate({
        target: appUsers.ssoId,
        set: {
          username: value.username,
          email: value.email,
          updatedAt: value.updatedAt,
        },
      })
      .run()
    return value
  }

  async getById(id: string): Promise<AppUser | undefined> {
    return this.database.db.select().from(appUsers).where(eq(appUsers.id, id)).get()
  }
}
