import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from 'node:crypto'
import { eq } from 'drizzle-orm'
import type {
  CredentialStore as CredentialStoreContract,
  ModelCredentialStatus,
} from '@red-video-flow/workflow-core'
import type { LocalDatabase } from '../db/client.js'
import { userModelCredentials } from '../db/schema.js'

const algorithm = 'aes-256-gcm'

export class CredentialStore implements CredentialStoreContract {
  private readonly key: Buffer

  constructor(
    private readonly database: LocalDatabase,
    encryptionKey: string | Buffer,
  ) {
    this.key = normalizeEncryptionKey(encryptionKey)
  }

  async getStatus(userId: string): Promise<ModelCredentialStatus> {
    const row = this.getRow(userId)
    return row
      ? {
          configured: true,
          maskedToken: row.tokenFingerprint,
          updatedAt: row.updatedAt,
        }
      : { configured: false }
  }

  async getModelToken(userId: string) {
    const row = this.getRow(userId)
    if (!row) return undefined
    const decipher = createDecipheriv(
      algorithm,
      this.key,
      Buffer.from(row.encryptionIv, 'base64'),
    )
    decipher.setAuthTag(Buffer.from(row.encryptionAuthTag, 'base64'))
    return Buffer.concat([
      decipher.update(Buffer.from(row.encryptedToken, 'base64')),
      decipher.final(),
    ]).toString('utf8')
  }

  async setModelToken(userId: string, rawToken: string) {
    const token = rawToken.trim()
    if (!token) throw new Error('model token must not be empty')
    const existing = this.getRow(userId)
    const iv = randomBytes(12)
    const cipher = createCipheriv(algorithm, this.key, iv)
    const encrypted = Buffer.concat([cipher.update(token, 'utf8'), cipher.final()])
    const now = Date.now()
    this.database.db
      .insert(userModelCredentials)
      .values({
        userId,
        encryptedToken: encrypted.toString('base64'),
        encryptionIv: iv.toString('base64'),
        encryptionAuthTag: cipher.getAuthTag().toString('base64'),
        encryptionKeyVersion: 1,
        tokenFingerprint: fingerprint(token),
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: userModelCredentials.userId,
        set: {
          encryptedToken: encrypted.toString('base64'),
          encryptionIv: iv.toString('base64'),
          encryptionAuthTag: cipher.getAuthTag().toString('base64'),
          encryptionKeyVersion: 1,
          tokenFingerprint: fingerprint(token),
          updatedAt: now,
        },
      })
      .run()
    return this.getStatus(userId)
  }

  async deleteModelToken(userId: string) {
    this.database.db.delete(userModelCredentials)
      .where(eq(userModelCredentials.userId, userId))
      .run()
  }

  private getRow(userId: string) {
    return this.database.db.select()
      .from(userModelCredentials)
      .where(eq(userModelCredentials.userId, userId))
      .get()
  }
}

function normalizeEncryptionKey(value: string | Buffer) {
  const buffer = Buffer.isBuffer(value) ? value : Buffer.from(value, 'utf8')
  return buffer.length === 32 ? buffer : createHash('sha256').update(buffer).digest()
}

function fingerprint(token: string) {
  const suffix = token.slice(-4)
  const digest = createHash('sha256').update(token).digest('hex').slice(0, 8)
  return `****${suffix}:${digest}`
}
