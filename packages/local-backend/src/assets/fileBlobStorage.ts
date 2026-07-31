import { createHash, randomUUID } from 'node:crypto'
import {
  mkdir,
  readFile,
  rm,
  writeFile,
} from 'node:fs/promises'
import { join } from 'node:path'
import type {
  AssetReference,
  BlobReadRange,
  BlobStorage,
  StoredBlob,
} from '@red-video-flow/workflow-core'

type FileBlobRecord = StoredBlob & {
  ownerId: string
}

export class FileBlobStorage implements BlobStorage {
  constructor(
    private readonly directory: string,
    private readonly publicBasePath = '/api/blobs',
  ) {}

  async put(input: {
    ownerId: string
    fileName: string
    contentType?: string
    body: AsyncIterable<Uint8Array>
    size?: number
  }) {
    await mkdir(this.directory, { recursive: true })
    const chunks: Buffer[] = []
    for await (const chunk of input.body) chunks.push(Buffer.from(chunk))
    const bytes = Buffer.concat(chunks)
    const id = randomUUID()
    const record: FileBlobRecord = {
      id,
      ownerId: input.ownerId,
      fileName: input.fileName,
      contentType: input.contentType,
      size: bytes.length,
      sha256: createHash('sha256').update(bytes).digest('hex'),
      createdAt: Date.now(),
    }
    await Promise.all([
      writeFile(this.bodyPath(id), bytes),
      writeFile(this.metadataPath(id), JSON.stringify(record)),
    ])
    return storedBlob(record)
  }

  async stat(id: string) {
    const record = await this.readRecord(id)
    return record ? storedBlob(record) : undefined
  }

  async statForOwner(id: string, ownerId: string) {
    const record = await this.readRecord(id)
    return record?.ownerId === ownerId ? storedBlob(record) : undefined
  }

  async read(id: string, range?: BlobReadRange) {
    const bytes = await readFile(this.bodyPath(id))
    const body = range
      ? bytes.subarray(range.start, range.end + 1)
      : bytes
    return (async function* () { yield body })()
  }

  async readForOwner(id: string, ownerId: string, range?: BlobReadRange) {
    if (!await this.statForOwner(id, ownerId)) {
      throw new Error(`blob not found: ${id}`)
    }
    return this.read(id, range)
  }

  async delete(id: string) {
    await Promise.all([
      rm(this.bodyPath(id), { force: true }),
      rm(this.metadataPath(id), { force: true }),
    ])
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

  private async readRecord(id: string) {
    try {
      return JSON.parse(
        await readFile(this.metadataPath(id), 'utf8'),
      ) as FileBlobRecord
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined
      throw error
    }
  }

  private bodyPath(id: string) {
    return join(this.directory, `${id}.blob`)
  }

  private metadataPath(id: string) {
    return join(this.directory, `${id}.json`)
  }
}

function storedBlob(record: FileBlobRecord): StoredBlob {
  const { ownerId: _, ...blob } = record
  return blob
}
