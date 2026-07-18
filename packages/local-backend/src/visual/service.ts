import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { resolveOnPath } from '../agents/registry.js'

export type VisualEvent =
  | { type: 'start'; modelId: string; bin: string; argv: string[] }
  | { type: 'stdout'; text: string }
  | { type: 'stderr'; text: string }
  | { type: 'meta'; submitId: string }

export type VisualRunResult = {
  submitId?: string
  url?: string
  localPath?: string
  fileName?: string
  mimeType?: string
  text?: string
}

export type InvokeVisualModelInput = {
  modelId: string
  nodeKind: string
  prompt: string
  upstream?: any[]
  downloadDir: string
  assetUrlForPath: (filePath: string) => string
  onEvent?: (event: VisualEvent) => void
}

export class VisualService {
  listModels() {
    const binPath = resolveOnPath('dreamina')
    const models = [
      {
        id: 'dreamina',
        label: '即梦 Dreamina',
        vendor: 'ByteDance',
        available: Boolean(binPath),
        invokable: Boolean(binPath),
        binPath,
        capabilities: ['text2image', 'image2image', 'text2video', 'image2video', 'frames2video', 'multiframe2video', 'multimodal2video', 'image_upscale'],
      },
    ]

    return {
      models,
      installedCount: models.filter((model) => model.available).length,
      invokableCount: models.filter((model) => model.invokable).length,
    }
  }

  async invoke(input: InvokeVisualModelInput) {
    return invokeVisualModel(input)
  }
}

function runCli(bin: string, argv: string[], opts: { cwd?: string; onEvent?: (event: VisualEvent) => void } = {}) {
  return new Promise<{ code: number | null; stdout: string; stderr: string }>((resolve, reject) => {
    const child = spawn(bin, argv, {
      cwd: opts.cwd ?? process.cwd(),
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: process.platform === 'win32',
    })

    let stdout = ''
    let stderr = ''
    child.stdout.setEncoding('utf8')
    child.stderr.setEncoding('utf8')
    child.stdout.on('data', (chunk: string) => {
      stdout += chunk
      opts.onEvent?.({ type: 'stdout', text: chunk })
    })
    child.stderr.on('data', (chunk: string) => {
      stderr += chunk
      opts.onEvent?.({ type: 'stderr', text: chunk })
    })
    child.on('error', reject)
    child.on('close', (code) => resolve({ code, stdout, stderr }))
  })
}

function firstJsonObject(text: string) {
  const trimmed = text.trim()
  if (!trimmed) return null
  try {
    return JSON.parse(trimmed)
  } catch {}

  const start = trimmed.indexOf('{')
  const end = trimmed.lastIndexOf('}')
  if (start === -1 || end === -1 || end <= start) return null
  try {
    return JSON.parse(trimmed.slice(start, end + 1))
  } catch {
    return null
  }
}

function findValueDeep(value: any, keys: string[]): string | undefined {
  if (!value || typeof value !== 'object') return undefined
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findValueDeep(item, keys)
      if (found) return found
    }
    return undefined
  }

  for (const [key, child] of Object.entries(value)) {
    if (keys.includes(key) && (typeof child === 'string' || typeof child === 'number')) return String(child)
    const found = findValueDeep(child, keys)
    if (found) return found
  }
  return undefined
}

function findMediaUrl(value: any): string | undefined {
  if (!value || typeof value !== 'object') return undefined
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findMediaUrl(item)
      if (found) return found
    }
    return undefined
  }

  for (const [key, child] of Object.entries(value)) {
    if (typeof child === 'string' && /^https?:\/\//.test(child) && /(png|jpe?g|webp|mp4|mov|m4v)(\?|$)/i.test(child)) {
      return child
    }
    if (/url|uri|image|video|download/i.test(key)) {
      if (typeof child === 'string' && /^https?:\/\//.test(child)) return child
    }
    const found = findMediaUrl(child)
    if (found) return found
  }
  return undefined
}

function listDownloadedMedia(downloadDir: string) {
  if (!existsSync(downloadDir)) return []
  return readdirSync(downloadDir)
    .filter((name) => /\.(png|jpe?g|webp|gif|mp4|mov|m4v)$/i.test(name))
    .map((name) => path.join(downloadDir, name))
}

function buildDreaminaArgv({ nodeKind, prompt, upstream = [] }: { nodeKind: string; prompt: string; upstream?: any[] }) {
  const firstImage = upstream.find((node) => (node?.data?.materialType ?? node?.data?.kind) === 'image' && node?.data?.value?.localPath)

  if (nodeKind === 'image' && firstImage) {
    return ['image2image', '--images', firstImage.data.value.localPath, '--prompt', prompt, '--ratio=9:16', '--resolution_type=2k', '--poll=60']
  }

  if (nodeKind === 'image') {
    return ['text2image', '--prompt', prompt, '--ratio=9:16', '--resolution_type=2k', '--poll=60']
  }

  if (nodeKind === 'video' && firstImage) {
    return ['image2video', '--image', firstImage.data.value.localPath, '--prompt', prompt, '--duration=5', '--poll=60']
  }

  if (nodeKind === 'video') {
    return ['text2video', '--prompt', prompt, '--duration=5', '--ratio=9:16', '--video_resolution=720p', '--poll=60']
  }

  throw new Error(`Dreamina 不支持节点类型：${nodeKind}`)
}

async function invokeVisualModel({ modelId, nodeKind, prompt, upstream = [], downloadDir, assetUrlForPath, onEvent }: InvokeVisualModelInput): Promise<VisualRunResult> {
  if (modelId !== 'dreamina') throw new Error(`未知视觉模型：${modelId}`)
  const bin = resolveOnPath('dreamina')
  if (!bin) throw new Error('未检测到 dreamina CLI，请先安装并登录即梦 CLI。')

  mkdirSync(downloadDir, { recursive: true })
  const argv = buildDreaminaArgv({ nodeKind, prompt, upstream })
  onEvent?.({ type: 'start', modelId, bin, argv })
  const submit = await runCli(bin, argv, { onEvent })
  const submitJson = firstJsonObject(submit.stdout)
  const submitId = findValueDeep(submitJson, ['submit_id', 'submitId', 'id'])

  if (submit.code !== 0) {
    throw new Error(submit.stderr.trim() || submit.stdout.trim() || `dreamina 退出码 ${submit.code}`)
  }

  let queryJson = null
  let queryText = submit.stdout.trim()
  if (submitId) {
    onEvent?.({ type: 'meta', submitId })
    const query = await runCli(bin, ['query_result', `--submit_id=${submitId}`, `--download_dir=${downloadDir}`], { onEvent })
    queryJson = firstJsonObject(query.stdout)
    queryText = query.stdout.trim() || queryText
  }

  const downloaded = listDownloadedMedia(downloadDir)
  const localPath = downloaded[0]
  const remoteUrl = findMediaUrl(queryJson) ?? findMediaUrl(submitJson)

  return {
    submitId,
    localPath,
    url: localPath ? assetUrlForPath(localPath) : remoteUrl,
    fileName: localPath ? path.basename(localPath) : undefined,
    mimeType: nodeKind === 'image' ? 'image/generated' : 'video/generated',
    text: queryText || submit.stdout.trim(),
  }
}
