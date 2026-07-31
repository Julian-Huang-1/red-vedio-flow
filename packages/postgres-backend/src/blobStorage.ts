import { createHash, randomUUID } from 'node:crypto'
import type {
  AssetReference,
  BlobReadRange,
  BlobStorage,
  StoredBlob,
} from '@red-video-flow/workflow-core'
import type { PostgresDatabase } from './database.js'

export class PostgresLargeObjectStorage implements BlobStorage {
  constructor(
    private readonly sql: PostgresDatabase,
    private readonly publicBasePath = '/api/blobs',
  ) {}

  async put(input: {
    ownerId: string
    fileName: string
    contentType?: string
    body: AsyncIterable<Uint8Array>
    size?: number
  }) {
    const chunks: Buffer[] = []
    for await (const chunk of input.body) chunks.push(Buffer.from(chunk))
    const body = Buffer.concat(chunks)
    const id = randomUUID()
    const sha256 = createHash('sha256').update(body).digest('hex')
    const createdAt = Date.now()
    const rows = await this.sql.begin(async (tx) => {
      const oidRows = await tx`SELECT lo_from_bytea(0, ${body}) AS oid`
      const oid = Number(oidRows[0].oid)
      return tx`
        INSERT INTO stored_blobs (
          id, owner_id, lo_oid, file_name, content_type, size, sha256, created_at
        ) VALUES (
          ${id}, ${input.ownerId}, ${oid}, ${input.fileName},
          ${input.contentType ?? null}, ${body.length}, ${sha256}, ${createdAt}
        )
        RETURNING *
      `
    })
    return toBlob(rows[0])
  }

  async stat(id: string) {
    const rows = await this.sql`SELECT * FROM stored_blobs WHERE id = ${id} LIMIT 1`
    return rows[0] ? toBlob(rows[0]) : undefined
  }

  async statForOwner(id: string, ownerId: string) {
    const rows = await this.sql`
      SELECT * FROM stored_blobs WHERE id = ${id} AND owner_id = ${ownerId} LIMIT 1
    `
    return rows[0] ? toBlob(rows[0]) : undefined
  }

  async read(id: string, range?: BlobReadRange): Promise<AsyncIterable<Uint8Array>> {
    const rows = await this.sql`
      SELECT lo_get(
        lo_oid,
        ${range?.start ?? 0},
        ${range ? range.end - range.start + 1 : 2147483647}
      ) AS body
      FROM stored_blobs WHERE id = ${id} LIMIT 1
    `
    if (!rows[0]) throw new Error(`blob not found: ${id}`)
    const body = Buffer.from(rows[0].body as Uint8Array)
    return (async function* () {
      yield body
    })()
  }

  async readForOwner(id: string, ownerId: string, range?: BlobReadRange) {
    const owned = await this.statForOwner(id, ownerId)
    if (!owned) throw new Error(`blob not found: ${id}`)
    return this.read(id, range)
  }

  async delete(id: string) {
    await this.sql.begin(async (tx) => {
      const rows = await tx`DELETE FROM stored_blobs WHERE id = ${id} RETURNING lo_oid`
      if (rows[0]) await tx`SELECT lo_unlink(${Number(rows[0].lo_oid)})`
    })
  }

  toAssetReference(blob: StoredBlob, kind: AssetReference['kind']): AssetReference {
    return {
      id: blob.id,
      kind,
      url: `${this.publicBasePath}/${encodeURIComponent(blob.id)}`,
      name: blob.fileName,
      mimeType: blob.contentType,
      size: blob.size,
    }
  }
}

function toBlob(row: Record<string, unknown>): StoredBlob {
  return {
    id: String(row.id),
    fileName: String(row.file_name),
    contentType: row.content_type ? String(row.content_type) : undefined,
    size: Number(row.size),
    sha256: String(row.sha256),
    createdAt: Number(row.created_at),
  }
}
