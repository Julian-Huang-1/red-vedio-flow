import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import readline from 'node:readline'

const MODEL = 'gpt-image-2'
const API_VERSION = '2025-04-01-preview'
const DEFAULT_API_BASE_URL = 'https://maas.devops.rednote.life/hackson/openai'
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
      code: error?.code ?? 'GPT_IMAGE_ERROR',
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
      const available = Boolean(process.env.GPT_IMAGE_API_KEY)
      return respond(request.id, {
        ok: available,
        available,
        model: MODEL,
        generationsUrl: endpoint('/images/generations'),
        editsUrl: endpoint('/images/edits'),
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
      throw Object.assign(new Error('GPT Image requests complete synchronously and cannot be queried'), {
        code: 'QUERY_NOT_SUPPORTED',
        retryable: false,
      })
    }
    throw Object.assign(new Error(`unknown method: ${request.method}`), { code: 'METHOD_NOT_FOUND' })
  } catch (error) {
    fail(request.id, error)
  }
}

async function submit({ executionId, capability, prompt, inputs = [], options = {} }) {
  const outputFormat = normalizeOutputFormat(options.outputFormat)
  if (!['text-to-image', 'image-to-image'].includes(capability)) {
    throw clientError(`unsupported GPT Image capability: ${String(capability)}`, 'UNSUPPORTED_CAPABILITY')
  }
  if (capability === 'image-to-image' && !inputs.length) {
    throw clientError('image-to-image requires at least one input image', 'MISSING_IMAGE')
  }

  let payload
  let apiMode
  if (capability === 'text-to-image') {
    apiMode = 'images'
    payload = await requestImagesGeneration(executionId, {
      model: MODEL,
      prompt,
      n: 1,
      size: options.size,
      quality: options.quality,
      background: options.background,
      output_format: outputFormat,
      output_compression: boundedInteger(options.outputCompression, 80, 0, 100),
      moderation: options.moderation,
    })
  } else {
    apiMode = 'images-edits'
    payload = await requestImagesEdit(executionId, {
      prompt,
      inputs,
      options,
      outputFormat,
    })
  }

  const assets = await responseAssets(payload, {
    executionId,
    downloadDir: options.downloadDir,
    outputFormat,
  })
  if (!assets.length) {
    throw Object.assign(new Error('GPT Image response did not contain an image'), {
      code: 'MISSING_IMAGE_RESULT',
    })
  }
  return {
    status: 'completed',
    assets,
    text: responseText(payload),
    metadata: {
      apiMode,
      responseId: payload?.id,
      imageGenerationCallIds: imageGenerationCalls(payload).map((item) => item.id).filter(Boolean),
    },
  }
}

async function requestImagesEdit(executionId, { prompt, inputs, options, outputFormat }) {
  const form = new FormData()
  form.set('model', MODEL)
  form.set('prompt', prompt)
  appendFormValue(form, 'n', 1)
  appendFormValue(form, 'size', options.size)
  appendFormValue(form, 'quality', options.quality)
  appendFormValue(form, 'background', options.background)
  appendFormValue(form, 'output_format', outputFormat)
  appendFormValue(form, 'output_compression', boundedInteger(options.outputCompression, 80, 0, 100))
  appendFormValue(form, 'input_fidelity', options.inputFidelity)
  appendFormValue(form, 'moderation', options.moderation)

  for (const [index, asset] of inputs.entries()) {
    const image = await assetBlob(asset)
    form.append(
      inputs.length === 1 ? 'image' : 'image[]',
      image.blob,
      image.fileName || `input-${index + 1}.png`,
    )
  }
  return requestJson(executionId, endpoint('/images/edits'), {
    method: 'POST',
    body: form,
  })
}

function resolveResponseModel(value) {
  if (!value || value === 'gpt-5.5') return 'gpt-5.6-sol'
  return value
}

async function requestResponses(executionId, body, imageGenerationDeployment) {
  const apiKey = process.env.GPT_IMAGE_API_KEY
  if (!apiKey) throw clientError('GPT_IMAGE_API_KEY is not configured', 'MISSING_API_KEY')
  const controller = new AbortController()
  active.set(executionId, controller)
  try {
    const response = await fetch(endpoint('/responses'), {
      method: 'POST',
      headers: {
        'api-key': apiKey,
        'Content-Type': 'application/json',
        'x-ms-oai-image-generation-deployment': imageGenerationDeployment,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    })
    if (!response.ok) {
      const text = await response.text()
      const payload = parseJson(text)
      const message = findValueDeep(payload, ['message', 'error_message', 'error']) ?? text
      if (isModerationBlocked(text)) {
        throw Object.assign(
          new Error(`图片请求被 Azure 安全审核拦截，请调整提示词或输入图片后重试。${requestIdHint(text)}`),
          { code: 'MODERATION_BLOCKED', retryable: false },
        )
      }
      throw Object.assign(new Error(`GPT Image API ${response.status}: ${message}`), {
        code: `HTTP_${response.status}`,
        retryable: response.status === 429 || response.status >= 500,
      })
    }
    if (!body.stream) return parseJson(await response.text())
    if (!response.body) throw new Error('GPT Image streaming response has no body')
    const decoder = new TextDecoder()
    let buffer = ''
    let completed
    for await (const chunk of response.body) {
      buffer += decoder.decode(chunk, { stream: true })
      const frames = buffer.split('\n\n')
      buffer = frames.pop() ?? ''
      for (const frame of frames) {
        const line = frame.split('\n').find((item) => item.startsWith('data:'))
        if (!line) continue
        const data = line.slice(5).trim()
        if (!data || data === '[DONE]') continue
        const event = JSON.parse(data)
        if (
          event.type === 'response.image_generation_call.partial_image'
          && typeof event.partial_image_b64 === 'string'
        ) {
          emit(executionId, 'partial_image', {
            index: Number(event.partial_image_index) || 0,
            base64: event.partial_image_b64,
            mimeType: `image/${normalizeOutputFormat(body.tools?.[0]?.output_format)}`,
          })
        }
        if (event.type === 'response.completed') completed = event.response
        if (event.type === 'response.failed') throw new Error('GPT Image response failed')
      }
    }
    if (!completed) throw new Error('GPT Image stream ended before response.completed')
    return completed
  } finally {
    active.delete(executionId)
  }
}

async function requestImagesGeneration(executionId, body) {
  return requestJson(executionId, endpoint('/images/generations'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(compact(body)),
  })
}

async function assetDataUrl(asset) {
  if (typeof asset?.base64 === 'string') {
    return /^data:/i.test(asset.base64)
      ? asset.base64
      : `data:${asset.mimeType || 'image/png'};base64,${asset.base64}`
  }
  const image = await assetBlob(asset)
  const bytes = Buffer.from(await image.blob.arrayBuffer())
  return `data:${image.blob.type || 'image/png'};base64,${bytes.toString('base64')}`
}

async function requestJson(executionId, url, init) {
  const apiKey = process.env.GPT_IMAGE_API_KEY
  if (!apiKey) throw clientError('GPT_IMAGE_API_KEY is not configured', 'MISSING_API_KEY')

  const controller = new AbortController()
  active.set(executionId, controller)
  try {
    const response = await fetch(url, {
      ...init,
      headers: {
        'api-key': apiKey,
        ...init.headers,
      },
      signal: controller.signal,
    })
    const text = await response.text()
    const payload = parseJson(text)
    if (!response.ok) {
      const message = findValueDeep(payload, ['message', 'error_message', 'error'])
        ?? text
        ?? `HTTP ${response.status}`
      if (isModerationBlocked(text)) {
        throw Object.assign(
          new Error(`图片请求被 Azure 安全审核拦截，请调整提示词或输入图片后重试。${requestIdHint(text)}`),
          { code: 'MODERATION_BLOCKED', retryable: false },
        )
      }
      throw Object.assign(new Error(`GPT Image API ${response.status}: ${message}`), {
        code: `HTTP_${response.status}`,
        retryable: response.status === 429 || response.status >= 500,
      })
    }
    return payload
  } finally {
    active.delete(executionId)
  }
}

async function assetBlob(asset) {
  if (typeof asset?.localPath === 'string') {
    const bytes = await readFile(asset.localPath)
    return {
      blob: new Blob([bytes], { type: asset.mimeType || mimeType(asset.localPath) }),
      fileName: asset.fileName || path.basename(asset.localPath),
    }
  }
  if (typeof asset?.base64 === 'string') {
    const parsed = parseBase64(asset.base64)
    return {
      blob: new Blob([parsed.bytes], { type: asset.mimeType || parsed.mimeType }),
      fileName: asset.fileName,
    }
  }
  if (typeof asset?.remoteUrl === 'string' && /^https?:\/\//.test(asset.remoteUrl)) {
    const response = await fetch(asset.remoteUrl)
    if (!response.ok) throw new Error(`failed to download input image: HTTP ${response.status}`)
    return {
      blob: await response.blob(),
      fileName: asset.fileName || fileNameFromUrl(asset.remoteUrl),
    }
  }
  throw clientError('input image has no localPath, base64, or remoteUrl', 'INVALID_IMAGE_INPUT')
}

async function responseAssets(payload, { executionId, downloadDir, outputFormat }) {
  const calls = imageGenerationCalls(payload)
  const results = calls.length
    ? calls.map((item) => ({ base64: item.result }))
    : Array.isArray(payload?.data)
    ? payload.data
    : Array.isArray(payload?.output)
      ? payload.output
      : [payload]
  const assets = []
  for (const [index, result] of results.entries()) {
    const remoteUrl = directString(result, ['url', 'image_url', 'imageUrl'])
    if (remoteUrl && /^https?:\/\//.test(remoteUrl)) {
      assets.push({ remoteUrl, mimeType: mimeType(remoteUrl) })
      continue
    }
    const encoded = directString(result, ['b64_json', 'b64Json', 'base64'])
    if (!encoded) continue
    const parsed = parseBase64(encoded)
    const format = extension(outputFormat || parsed.mimeType)
    const targetDir = downloadDir || path.join(process.cwd(), '.generated', executionId)
    await mkdir(targetDir, { recursive: true })
    const fileName = `gpt-image-${index + 1}.${format}`
    const localPath = path.join(targetDir, fileName)
    await writeFile(localPath, parsed.bytes)
    assets.push({
      localPath,
      fileName,
      mimeType: parsed.mimeType === 'application/octet-stream'
        ? mimeType(fileName)
        : parsed.mimeType,
    })
  }
  return assets
}

function imageGenerationCalls(payload) {
  return Array.isArray(payload?.output)
    ? payload.output.filter((item) => item?.type === 'image_generation_call' && typeof item.result === 'string')
    : []
}

function endpoint(pathname) {
  const baseUrl = (process.env.GPT_IMAGE_API_BASE_URL || DEFAULT_API_BASE_URL).replace(/\/+$/, '')
  return `${baseUrl}${pathname}?api-version=${encodeURIComponent(API_VERSION)}`
}

function compact(value) {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined))
}

function appendFormValue(form, key, value) {
  if (value !== undefined && value !== null && value !== '') form.set(key, String(value))
}

function normalizeOutputFormat(value) {
  const format = String(value ?? 'jpeg').toLowerCase()
  if (!['png', 'jpeg', 'webp'].includes(format)) {
    throw clientError(`unsupported output format: ${format}`, 'INVALID_OUTPUT_FORMAT')
  }
  return format
}

function parseJson(text) {
  if (!text) return {}
  try {
    return JSON.parse(text)
  } catch {
    throw Object.assign(new Error(`GPT Image API returned invalid JSON: ${text.slice(0, 500)}`), {
      code: 'INVALID_RESPONSE',
    })
  }
}

function parseBase64(value) {
  const match = value.match(/^data:([^;,]+);base64,(.*)$/s)
  return {
    mimeType: match?.[1] ?? 'application/octet-stream',
    bytes: Buffer.from(match?.[2] ?? value, 'base64'),
  }
}

function directString(value, keys) {
  if (!value || typeof value !== 'object') return undefined
  for (const key of keys) {
    if (typeof value[key] === 'string') return value[key]
  }
  return undefined
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

function isModerationBlocked(value) {
  return value.includes('moderation_blocked') || value.includes('safety_violations=')
}

function requestIdHint(value) {
  const match = value.match(/request ID ([0-9a-f-]+)/i)
  return match ? ` Request ID：${match[1]}` : ''
}

function responseText(payload) {
  const revisedPrompt = findValueDeep(payload, ['revised_prompt', 'revisedPrompt'])
  return revisedPrompt || undefined
}

function positiveInteger(value, fallback) {
  const number = Number(value ?? fallback)
  return Number.isInteger(number) && number > 0 ? number : fallback
}

function boundedInteger(value, fallback, min, max) {
  const number = Number(value ?? fallback)
  return Number.isInteger(number) && number >= min && number <= max ? number : fallback
}

function clientError(message, code) {
  return Object.assign(new Error(message), { code, retryable: false })
}

function fileNameFromUrl(value) {
  try {
    return path.basename(new URL(value).pathname) || 'input.png'
  } catch {
    return 'input.png'
  }
}

function extension(value) {
  if (value === 'jpeg' || value === 'image/jpeg') return 'jpg'
  if (value === 'png' || value === 'image/png') return 'png'
  if (value === 'webp' || value === 'image/webp') return 'webp'
  return 'bin'
}

function mimeType(value) {
  let pathname = value
  try {
    pathname = new URL(value, 'file:///').pathname
  } catch {}
  const suffix = path.extname(pathname).toLowerCase()
  if (suffix === '.png') return 'image/png'
  if (suffix === '.jpg' || suffix === '.jpeg') return 'image/jpeg'
  if (suffix === '.webp') return 'image/webp'
  return 'application/octet-stream'
}
