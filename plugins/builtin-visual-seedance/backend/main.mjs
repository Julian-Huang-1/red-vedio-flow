import readline from 'node:readline'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'

const MODEL = 'Doubao-seedance2.0'
const PROVIDER = 'doubao-seedance2.0'
const DEFAULT_API_BASE_URL = 'https://maas.devops.xiaohongshu.com/hackson/openai'
const TASKS_PATH = '/doubao/contents/generations/tasks'
const lines = readline.createInterface({ input: process.stdin, crlfDelay: Infinity })
const active = new Map()

function send(value) {
  process.stdout.write(`${JSON.stringify(value)}\n`)
}

function respond(id, result) {
  send({ jsonrpc: '2.0', id, result: result ?? null })
}

function fail(id, error) {
  send({
    jsonrpc: '2.0',
    id,
    error: {
      code: error?.code ?? 'SEEDANCE_ERROR',
      message: error instanceof Error ? error.message : String(error),
      retryable: error?.retryable ?? true,
    },
  })
}

function emit(executionId, type, data) {
  send({
    jsonrpc: '2.0',
    method: 'execution.event',
    params: { executionId, type, data },
  })
}

lines.on('line', (line) => {
  void handle(JSON.parse(line))
})

async function handle(request) {
  try {
    if (request.method === 'plugin.initialize') return respond(request.id, { ready: true })
    if (request.method === 'plugin.activate') return respond(request.id, { active: true })
    if (request.method === 'plugin.health' || request.method === 'visual.describe') {
      return respond(request.id, {
        ok: Boolean(process.env.DOUBAO_SEEDANCE_API_KEY),
        available: Boolean(process.env.DOUBAO_SEEDANCE_API_KEY),
        model: MODEL,
        tasksUrl: tasksUrl(),
        activeExecutions: active.size,
      })
    }
    if (request.method === 'plugin.deactivate') return respond(request.id, { active: false })
    if (request.method === 'plugin.dispose') {
      for (const controller of active.values()) controller.abort()
      respond(request.id, { disposed: true })
      setTimeout(() => process.exit(0), 0)
      return
    }
    if (request.method === 'execution.cancel' || request.method === 'visual.cancel') {
      const controller = active.get(request.params?.executionId)
      controller?.abort()
      return respond(request.id, { cancelled: Boolean(controller) })
    }
    if (request.method === 'visual.submit') {
      const input = request.params?.input ?? request.params ?? {}
      return respond(request.id, await submit({
        executionId: request.params?.executionId ?? input.executionId,
        ...input,
      }))
    }
    if (request.method === 'visual.query') {
      const input = request.params?.input ?? request.params ?? {}
      return respond(request.id, await query({
        executionId: request.params?.executionId ?? input.executionId,
        ...input,
      }))
    }
    throw Object.assign(new Error(`unknown method: ${request.method}`), { code: 'METHOD_NOT_FOUND' })
  } catch (error) {
    fail(request.id, error)
  }
}

async function submit({ executionId, capability, prompt, inputs = [], options = {} }) {
  if (!['text-to-video', 'image-to-video'].includes(capability)) {
    throw Object.assign(new Error(`unsupported Seedance capability: ${String(capability)}`), {
      code: 'UNSUPPORTED_CAPABILITY',
      retryable: false,
    })
  }

  const content = [{ type: 'text', text: prompt }]
  if (capability === 'image-to-video') {
    const imageUrl = await firstAssetUrl(inputs)
    if (!imageUrl) {
      throw Object.assign(new Error('image-to-video requires an image URL, local path, or base64 input'), {
        code: 'MISSING_IMAGE_URL',
        retryable: false,
      })
    }
    content.push({
      type: 'image_url',
      image_url: { url: imageUrl },
      role: 'reference_image',
    })
  }

  emit(executionId, 'progress', { phase: 'submitting', model: MODEL })
  const payload = await requestJson(executionId, tasksUrl(), {
    method: 'POST',
    body: JSON.stringify({
      provider: PROVIDER,
      model: MODEL,
      content,
      ...pickGenerationOptions(options),
    }),
  })
  const externalTaskId = findValueDeep(payload, ['id', 'task_id', 'taskId', 'cgt_id', 'cgtId'])
  if (!externalTaskId) {
    throw Object.assign(new Error('Seedance create response did not contain a task ID'), {
      code: 'MISSING_TASK_ID',
    })
  }
  emit(executionId, 'submitted', { externalTaskId })
  return {
    status: 'pending',
    externalTaskId,
    text: JSON.stringify(payload),
  }
}

function pickGenerationOptions(options) {
  const result = {}
  if (typeof options.ratio === 'string') result.ratio = options.ratio
  if (Number.isInteger(options.duration)) result.duration = options.duration
  if (typeof options.resolution === 'string') result.resolution = options.resolution
  if (typeof options.generate_audio === 'boolean') result.generate_audio = options.generate_audio
  if (typeof options.camera_fixed === 'boolean') result.camera_fixed = options.camera_fixed
  if (typeof options.watermark === 'boolean') result.watermark = options.watermark
  if (Number.isInteger(options.seed)) result.seed = options.seed
  if (typeof options.return_last_frame === 'boolean') result.return_last_frame = options.return_last_frame
  if (typeof options.callback_url === 'string' && options.callback_url) result.callback_url = options.callback_url
  return result
}

async function query({ executionId, externalTaskId, options = {} }) {
  const payload = await requestJson(
    executionId,
    `${tasksUrl()}/${encodeURIComponent(externalTaskId)}`,
    { method: 'GET' },
  )
  const status = normalizedStatus(findValueDeep(payload, ['status', 'state', 'task_status', 'taskStatus']))
  const videoUrl = findNamedMediaUrl(payload, ['video_url', 'videoUrl']) ?? findMediaUrl(payload)
  const lastFrameUrl = findNamedMediaUrl(payload, [
    'last_frame_url',
    'lastFrameUrl',
    'last_frame_image_url',
    'lastFrameImageUrl',
  ])

  if (videoUrl && status !== 'failed') {
    const assets = [
      await downloadAsset(videoUrl, options.downloadDir, 'seedance-video.mp4', 'video/mp4', 'output'),
    ]
    if (lastFrameUrl) {
      assets.push(await downloadAsset(
        lastFrameUrl,
        options.downloadDir,
        'seedance-last-frame.png',
        'image/png',
        'last_frame',
      ))
    }
    return {
      status: 'succeeded',
      assets,
      text: JSON.stringify(payload),
    }
  }
  if (status === 'failed') {
    return {
      status: 'failed',
      code: 'SEEDANCE_TASK_FAILED',
      message: findValueDeep(payload, ['message', 'error_message', 'fail_reason', 'error']) ?? 'Seedance task failed',
      text: JSON.stringify(payload),
    }
  }
  return {
    status: 'pending',
    progress: numericProgress(findValueDeep(payload, ['progress', 'percent', 'percentage'])),
    text: JSON.stringify(payload),
  }
}

async function downloadAsset(remoteUrl, downloadDir, fileName, mimeType, role) {
  if (!downloadDir) return { remoteUrl, fileName, mimeType, role }
  const response = await fetch(remoteUrl)
  if (!response.ok) throw new Error(`failed to download Seedance asset: HTTP ${response.status}`)
  await mkdir(downloadDir, { recursive: true })
  const localPath = path.join(downloadDir, fileName)
  await writeFile(localPath, Buffer.from(await response.arrayBuffer()))
  return { localPath, fileName, mimeType, role }
}

async function requestJson(executionId, url, init) {
  const apiKey = process.env.DOUBAO_SEEDANCE_API_KEY
  if (!apiKey) {
    throw Object.assign(new Error('DOUBAO_SEEDANCE_API_KEY is not configured'), {
      code: 'MISSING_API_KEY',
      retryable: false,
    })
  }

  const controller = new AbortController()
  active.set(executionId, controller)
  try {
    const headers = {
      'api-key': apiKey,
      'Content-Type': 'application/json',
      ...init.headers,
    }
    emit(executionId, 'debug_http_request', {
      method: init.method ?? 'GET',
      url,
      headers,
      body: typeof init.body === 'string' ? parseJson(init.body) : init.body,
      recordedAt: Date.now(),
    })
    const response = await fetch(url, {
      ...init,
      headers,
      signal: controller.signal,
    })
    const text = await response.text()
    const payload = parseJson(text)
    if (!response.ok) {
      const message = findValueDeep(payload, ['message', 'error_message', 'error'])
        ?? text
        ?? `HTTP ${response.status}`
      throw Object.assign(new Error(`Seedance API ${response.status}: ${message}`), {
        code: `HTTP_${response.status}`,
        retryable: response.status === 429 || response.status >= 500,
      })
    }
    return payload
  } finally {
    active.delete(executionId)
  }
}

function tasksUrl() {
  const baseUrl = (process.env.DOUBAO_SEEDANCE_API_BASE_URL || DEFAULT_API_BASE_URL).replace(/\/+$/, '')
  return `${baseUrl}${TASKS_PATH}`
}

async function firstAssetUrl(inputs) {
  for (const asset of inputs) {
    const url = await assetUrl(asset)
    if (url) return url
  }
  return undefined
}

async function assetUrl(asset) {
  if (typeof asset?.remoteUrl === 'string' && /^https?:\/\//.test(asset.remoteUrl)) return asset.remoteUrl
  if (typeof asset?.base64 === 'string') {
    if (/^data:[^;,]+;base64,/i.test(asset.base64)) return asset.base64
    return `data:${asset.mimeType || 'image/png'};base64,${asset.base64}`
  }
  if (typeof asset?.localPath === 'string') {
    const bytes = await readFile(asset.localPath)
    return `data:${asset.mimeType || imageMimeType(asset.localPath)};base64,${bytes.toString('base64')}`
  }
  return undefined
}

function imageMimeType(value) {
  const extension = path.extname(value).toLowerCase()
  if (extension === '.jpg' || extension === '.jpeg') return 'image/jpeg'
  if (extension === '.webp') return 'image/webp'
  if (extension === '.gif') return 'image/gif'
  return 'image/png'
}

function parseJson(text) {
  if (!text) return {}
  try {
    return JSON.parse(text)
  } catch {
    throw Object.assign(new Error(`Seedance API returned invalid JSON: ${text.slice(0, 500)}`), {
      code: 'INVALID_RESPONSE',
    })
  }
}

function findValueDeep(value, keys) {
  if (!value || typeof value !== 'object') return undefined
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findValueDeep(item, keys)
      if (found !== undefined) return found
    }
    return undefined
  }
  for (const [key, child] of Object.entries(value)) {
    if (keys.includes(key) && ['string', 'number'].includes(typeof child)) return String(child)
    const found = findValueDeep(child, keys)
    if (found !== undefined) return found
  }
  return undefined
}

function findMediaUrl(value) {
  if (!value || typeof value !== 'object') return undefined
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findMediaUrl(item)
      if (found) return found
    }
    return undefined
  }
  for (const [key, child] of Object.entries(value)) {
    if (
      typeof child === 'string'
      && /^https?:\/\//.test(child)
      && (/video|url|uri|download/i.test(key) || /\.(mp4|mov|m4v)(\?|$)/i.test(child))
    ) {
      return child
    }
    const found = findMediaUrl(child)
    if (found) return found
  }
  return undefined
}

function findNamedMediaUrl(value, keys) {
  if (!value || typeof value !== 'object') return undefined
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findNamedMediaUrl(item, keys)
      if (found) return found
    }
    return undefined
  }
  for (const [key, child] of Object.entries(value)) {
    if (keys.includes(key) && typeof child === 'string' && /^https?:\/\//.test(child)) {
      return child
    }
    const found = findNamedMediaUrl(child, keys)
    if (found) return found
  }
  return undefined
}

function normalizedStatus(value) {
  const status = value?.toLowerCase()
  if (['failed', 'fail', 'error', 'cancelled', 'canceled', 'rejected'].includes(status)) return 'failed'
  if (['success', 'succeeded', 'done', 'completed', 'complete', 'finished'].includes(status)) return 'succeeded'
  return 'pending'
}

function numericProgress(value) {
  const progress = Number(value)
  return Number.isFinite(progress) ? progress : undefined
}
