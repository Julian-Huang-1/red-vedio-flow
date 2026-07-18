import { createReadStream, existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { extname, join, normalize, relative } from 'node:path'

export type UploadAssetInput = {
  fileName: string
  mimeType?: string
  bytes: Buffer
}

export type UploadedAsset = {
  url: string
  localPath: string
  fileName: string
}

export class AssetService {
  readonly uploadDir: string
  readonly generatedDir: string

  constructor(private readonly dataDir: string) {
    this.uploadDir = join(dataDir, 'uploads')
    this.generatedDir = join(dataDir, 'generated')
    mkdirSync(this.uploadDir, { recursive: true })
    mkdirSync(this.generatedDir, { recursive: true })
  }

  upload(input: UploadAssetInput): UploadedAsset {
    const fileName = safeFileName(input.fileName)
    const storedName = `${Date.now()}-${Math.round(Math.random() * 10000)}-${fileName}`
    const filePath = join(this.uploadDir, storedName)
    writeFileSync(filePath, input.bytes)
    return {
      url: this.assetUrlForPath(filePath),
      localPath: filePath,
      fileName,
    }
  }

  resolveAssetPath(assetUrl: string) {
    const rel = decodeURIComponent(assetUrl.replace('/api/assets/', ''))
    const filePath = normalize(join(this.dataDir, rel))
    if (!filePath.startsWith(this.dataDir) || !existsSync(filePath)) return undefined
    return filePath
  }

  createAssetReadStream(filePath: string) {
    return createReadStream(filePath)
  }

  assetUrlForPath(filePath: string) {
    const rel = relative(this.dataDir, filePath).split('/').map(encodeURIComponent).join('/')
    return `/api/assets/${rel}`
  }
}

export function contentTypeFor(filePath: string) {
  const ext = extname(filePath).toLowerCase()
  if (ext === '.html') return 'text/html; charset=utf-8'
  if (ext === '.js') return 'text/javascript; charset=utf-8'
  if (ext === '.css') return 'text/css; charset=utf-8'
  if (ext === '.json') return 'application/json; charset=utf-8'
  if (ext === '.svg') return 'image/svg+xml'
  if (ext === '.png') return 'image/png'
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg'
  if (ext === '.webp') return 'image/webp'
  if (ext === '.gif') return 'image/gif'
  if (ext === '.mp4') return 'video/mp4'
  if (ext === '.mov') return 'video/quicktime'
  return 'application/octet-stream'
}

function safeFileName(name: string) {
  return String(name || 'asset.bin').replace(/[^\w.-]+/g, '_')
}
