import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from 'node:crypto'
import type {
  CredentialStore,
  ModelCredentialStatus,
} from '@red-video-flow/workflow-core'
import type { PostgresDatabase } from './database.js'

const algorithm = 'aes-256-gcm'

export class PostgresCredentialStore implements CredentialStore {
  private readonly key: Buffer

  constructor(
    private readonly sql: PostgresDatabase,
    encryptionKey: string | Buffer,
  ) {
    const raw = Buffer.isBuffer(encryptionKey) ? encryptionKey : Buffer.from(encryptionKey)
    this.key = raw.length === 32 ? raw : createHash('sha256').update(raw).digest()
  }

  async getStatus(userId: string): Promise<ModelCredentialStatus> {
    const rows = await this.sql`
      SELECT token_fingerprint, updated_at
      FROM user_model_credentials WHERE user_id = ${userId} LIMIT 1
    `
    return rows[0]
      ? {
          configured: true,
          maskedToken: String(rows[0].token_fingerprint),
          updatedAt: Number(rows[0].updated_at),
        }
      : { configured: false }
  }

  async getModelToken(userId: string) {
    const rows = await this.sql`
      SELECT encrypted_token, encryption_iv, encryption_auth_tag
      FROM user_model_credentials WHERE user_id = ${userId} LIMIT 1
    `
    const row = rows[0]
    if (!row) return undefined
    const decipher = createDecipheriv(
      algorithm,
      this.key,
      Buffer.from(String(row.encryption_iv), 'base64'),
    )
    decipher.setAuthTag(Buffer.from(String(row.encryption_auth_tag), 'base64'))
    return Buffer.concat([
      decipher.update(Buffer.from(String(row.encrypted_token), 'base64')),
      decipher.final(),
    ]).toString('utf8')
  }

  async setModelToken(userId: string, rawToken: string) {
    const token = rawToken.trim()
    if (!token) throw new Error('model token must not be empty')
    const iv = randomBytes(12)
    const cipher = createCipheriv(algorithm, this.key, iv)
    const encrypted = Buffer.concat([cipher.update(token), cipher.final()])
    const now = Date.now()
    await this.sql`
      INSERT INTO user_model_credentials (
        user_id, encrypted_token, encryption_iv, encryption_auth_tag,
        encryption_key_version, token_fingerprint, created_at, updated_at
      ) VALUES (
        ${userId}, ${encrypted.toString('base64')}, ${iv.toString('base64')},
        ${cipher.getAuthTag().toString('base64')}, 1, ${fingerprint(token)}, ${now}, ${now}
      )
      ON CONFLICT (user_id) DO UPDATE SET
        encrypted_token = EXCLUDED.encrypted_token,
        encryption_iv = EXCLUDED.encryption_iv,
        encryption_auth_tag = EXCLUDED.encryption_auth_tag,
        encryption_key_version = EXCLUDED.encryption_key_version,
        token_fingerprint = EXCLUDED.token_fingerprint,
        updated_at = EXCLUDED.updated_at
    `
    return this.getStatus(userId)
  }

  async deleteModelToken(userId: string) {
    await this.sql`DELETE FROM user_model_credentials WHERE user_id = ${userId}`
  }
}

function fingerprint(token: string) {
  return `****${token.slice(-4)}:${createHash('sha256').update(token).digest('hex').slice(0, 8)}`
}
