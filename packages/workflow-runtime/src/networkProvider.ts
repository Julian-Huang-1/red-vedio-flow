import { randomUUID } from 'node:crypto'
import type {
  AssetKind,
  AssetReference,
  BlobStorage,
  NodeResult,
  NodeRunInput,
  Provider,
  ProviderExecutionContext,
  ProviderExecutionResult,
  ProviderModality,
} from '@red-video-flow/workflow-core'
import {
  buildOpenAITextRequest,
} from './providerAdapters.js'
import {
  buildSeedanceCreateTaskRequest,
  seedanceFailureMessage,
  seedanceMedia,
  seedanceTaskId,
  seedanceTaskStatus,
} from './seedanceProtocol.js'

export const DEFAULT_TEXT_PROVIDER_URL =
  'https://maas.devops.rednote.life/hackson/v1/responses'
export const DEFAULT_IMAGE_PROVIDER_URL =
  'https://maas.devops.rednote.life/hackson/openai/images/generations?api-version=2025-04-01-preview'
export const DEFAULT_VIDEO_PROVIDER_URL =
  'https://maas.devops.xiaohongshu.com/hackson/openai/doubao/contents/generations/tasks'

export class NetworkBoundaryProvider implements Provider {
  constructor(
    readonly id: string,
    readonly modality: ProviderModality,
    private readonly url: string,
  ) {}

  async execute(input: NodeRunInput, context: ProviderExecutionContext): Promise<ProviderExecutionResult> {
    const resolvedInput = await resolveBlobInputs(input, context.userId, context.blobs)
    const body = buildProviderRequest(this.modality, resolvedInput)
    const multipart = body instanceof FormData
    const requestUrl = multipart && this.modality === 'image'
      ? imageEditsUrl(this.url)
      : this.url
    const headers: Record<string, string> = {
      Authorization: `Bearer ${context.token}`,
      ...(!multipart ? { 'Content-Type': 'application/json' } : {}),
    }
    const tracedBody = multipart ? describeFormData(body) : body
    await context.trace.recordProviderInput(tracedBody)
    await context.trace.recordNetworkRequest({
      transport: 'http',
      method: 'POST',
      url: requestUrl,
      headers: { ...headers, Authorization: '[REDACTED]' },
      body: tracedBody,
      recordedAt: Date.now(),
    })
    const response = await fetch(requestUrl, {
      method: 'POST',
      headers,
      body: multipart ? body : JSON.stringify(body),
      signal: context.signal,
    })
    let payload = await readProviderResponse(response, this.modality, resolvedInput, context)
    await context.trace.recordResponse(sanitizeProviderPayload(payload))
    if (!response.ok) {
      const message = providerErrorMessage(payload, response.status)
      throw new ProviderBoundaryError(`provider_http_${response.status}`, message, response.status >= 500)
    }
    let record = unwrapProviderPayload(payload)
    const providerResponseId = string(record.id) ?? string(record.responseId)
    const providerTaskId = this.modality === 'video'
      ? seedanceTaskId(record)
      : string(record.taskId) ?? string(record.submitId)
    if (this.modality === 'video' && providerTaskId && !seedanceMedia(record).videoUrl) {
      await context.emit({ type: 'provider-task', taskId: providerTaskId })
      payload = await pollSeedanceTask(
        this.url,
        providerTaskId,
        headers,
        context,
      )
      record = unwrapProviderPayload(payload)
    }
    const results = await normalizeResults(
      this.modality,
      record,
      input,
      context,
      providerResponseId,
      providerTaskId,
    )
    return { results, providerResponseId, providerTaskId, raw: record }
  }
}

export function buildProviderRequest(modality: ProviderModality, input: NodeRunInput) {
  if (modality === 'text') return buildOpenAITextRequest(input)
  if (modality === 'image') return buildImageGenerationRequest(input)
  return buildSeedanceCreateTaskRequest(input)
}

async function pollSeedanceTask(
  createUrl: string,
  taskId: string,
  headers: Record<string, string>,
  context: ProviderExecutionContext,
) {
  const url = taskUrl(createUrl, taskId)
  let consecutiveFailures = 0
  while (!context.signal.aborted) {
    await abortableDelay(2_000, context.signal)
    await context.trace.recordNetworkRequest({
      transport: 'http',
      method: 'GET',
      url,
      headers: { ...headers, Authorization: '[REDACTED]' },
      recordedAt: Date.now(),
    })
    let response: Response
    try {
      response = await fetch(url, {
        method: 'GET',
        headers,
        signal: context.signal,
      })
    } catch (error) {
      if (context.signal.aborted) throw error
      consecutiveFailures += 1
      if (consecutiveFailures <= 5) continue
      throw new ProviderBoundaryError(
        'seedance_poll_network_error',
        `Seedance 轮询连续 ${consecutiveFailures} 次网络失败：${error instanceof Error ? error.message : String(error)}`,
        true,
      )
    }
    const payload = await response.json().catch(() => undefined)
    await context.trace.recordResponse(sanitizeProviderPayload(payload))
    if (!response.ok) {
      const retryable = response.status === 404
        || response.status === 408
        || response.status === 429
        || response.status >= 500
      if (retryable) {
        consecutiveFailures += 1
        if (consecutiveFailures <= 5) continue
      }
      throw new ProviderBoundaryError(
        `provider_http_${response.status}`,
        providerErrorMessage(payload, response.status),
        retryable,
      )
    }
    consecutiveFailures = 0
    const record = unwrapProviderPayload(payload)
    const media = seedanceMedia(record)
    if (media.videoUrl) {
      return {
        ...record,
        video: { url: media.videoUrl, mimeType: 'video/mp4', fileName: 'seedance-video.mp4' },
        lastFrame: media.lastFrameUrl
          ? { url: media.lastFrameUrl, mimeType: 'image/png', fileName: 'seedance-last-frame.png' }
          : undefined,
      }
    }
    if (seedanceTaskStatus(record) === 'failed') {
      throw new ProviderBoundaryError(
        'seedance_task_failed',
        seedanceFailureMessage(record),
        false,
      )
    }
  }
  throw new DOMException('Seedance task aborted', 'AbortError')
}

function taskUrl(createUrl: string, taskId: string) {
  const url = new URL(createUrl)
  url.pathname = `${url.pathname.replace(/\/+$/, '')}/${encodeURIComponent(taskId)}`
  return url.toString()
}

function abortableDelay(ms: number, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    const timer = setTimeout(resolve, ms)
    signal.addEventListener('abort', () => {
      clearTimeout(timer)
      reject(new DOMException('Aborted', 'AbortError'))
    }, { once: true })
  })
}

function providerErrorMessage(payload: unknown, status: number) {
  if (isRecord(payload) && typeof payload.error === 'string') return payload.error
  const record = unwrapProviderPayload(payload)
  return seedanceFailureMessage(record) || `provider request failed with ${status}`
}

function buildImageGenerationRequest(input: NodeRunInput) {
  if (input.generationConfig.type !== 'openai-image') {
    throw new Error('image provider requires openai-image generation config')
  }
  const options = input.generationConfig.providerOptions ?? {}
  const upstreamText = input.upstreamResults
    .map((result) => result.text?.trim())
    .filter((text): text is string => Boolean(text))
  const prompt = [...upstreamText, input.prompt.trim()].filter(Boolean).join('\n\n')
  const images = [
    ...input.attachments,
    ...input.upstreamResults.flatMap((result) => result.assets),
  ].filter((asset) => asset.kind === 'image')
  if (images.length) {
    const form = new FormData()
    form.set('model', input.model.modelId)
    form.set('prompt', prompt)
    appendFormValue(form, 'n', 1)
    appendFormValue(form, 'size', input.generationConfig.size ?? stringOption(options.size))
    appendFormValue(form, 'quality', input.generationConfig.quality ?? stringOption(options.quality))
    appendFormValue(form, 'background', input.generationConfig.background ?? stringOption(options.background))
    appendFormValue(form, 'output_format', input.generationConfig.outputFormat ?? stringOption(options.outputFormat))
    appendFormValue(
      form,
      'output_compression',
      input.generationConfig.outputCompression ?? numberOption(options.outputCompression),
    )
    appendFormValue(form, 'input_fidelity', input.generationConfig.inputFidelity ?? stringOption(options.inputFidelity))
    appendFormValue(form, 'moderation', input.generationConfig.moderation ?? stringOption(options.moderation))
    for (const [index, image] of images.entries()) {
      const parsed = parseDataUrl(image.url)
      if (!parsed) throw new Error(`image edit input must resolve to a data URL: ${image.name ?? image.id}`)
      form.append(
        images.length === 1 ? 'image' : 'image[]',
        new Blob([Buffer.from(parsed.base64, 'base64')], { type: parsed.mimeType }),
        image.name ?? `input-${index + 1}.${extension(parsed.mimeType)}`,
      )
    }
    return form
  }
  return removeUndefined({
    model: input.model.modelId,
    prompt,
    n: 1,
    size: input.generationConfig.size ?? stringOption(options.size),
    quality: input.generationConfig.quality ?? stringOption(options.quality),
    background: input.generationConfig.background ?? stringOption(options.background),
    output_format: input.generationConfig.outputFormat ?? stringOption(options.outputFormat),
    output_compression: input.generationConfig.outputCompression
      ?? numberOption(options.outputCompression),
    moderation: input.generationConfig.moderation ?? stringOption(options.moderation),
  })
}

function imageEditsUrl(generationsUrl: string) {
  const url = new URL(generationsUrl)
  url.pathname = url.pathname.replace(/\/images\/generations\/?$/, '/images/edits')
  return url.toString()
}

function appendFormValue(form: FormData, name: string, value: unknown) {
  if (value !== undefined) form.set(name, String(value))
}

function describeFormData(form: FormData) {
  return {
    type: 'multipart/form-data',
    fields: Array.from(form.entries()).map(([name, value]) => (
      typeof value === 'string'
        ? { name, value }
        : { name, fileName: value.name, mimeType: value.type, size: value.size }
    )),
  }
}

function stringOption(value: unknown) {
  return typeof value === 'string' && value && value !== 'auto' ? value : undefined
}

function numberOption(value: unknown) {
  return typeof value === 'number' ? value : undefined
}

function removeUndefined(value: Record<string, unknown>) {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined))
}

async function readProviderResponse(
  response: Response,
  modality: ProviderModality,
  input: NodeRunInput,
  context: ProviderExecutionContext,
): Promise<unknown> {
  if (
    response.ok
    && modality === 'text'
    && input.generationConfig.type === 'openai-text'
    && input.generationConfig.stream
  ) {
    return readOpenAIEventStream(response, context)
  }
  return response.json().catch(() => undefined)
}

async function readOpenAIEventStream(response: Response, context: ProviderExecutionContext) {
  if (!response.body) throw new ProviderBoundaryError('missing_response_body', 'provider returned no response body', true)
  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let completed: unknown
  let streamedText = ''
  while (true) {
    const { value, done } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const chunks = buffer.split(/\r?\n\r?\n/)
    buffer = chunks.pop() ?? ''
    for (const chunk of chunks) {
      const data = chunk.split(/\r?\n/)
        .filter((line) => line.startsWith('data:'))
        .map((line) => line.slice(5).trim())
        .join('\n')
      if (!data || data === '[DONE]') continue
      const event = JSON.parse(data) as Record<string, any>
      if (event.type === 'response.output_text.delta' && typeof event.delta === 'string') {
        streamedText += event.delta
        await context.emit({ type: 'text-delta', delta: event.delta })
      }
      if (event.type === 'response.completed') completed = event.response
      if (event.type === 'response.failed') completed = event.response ?? event
    }
  }
  if (isRecord(completed) && streamedText && !extractText(completed)) {
    return { ...completed, output_text: streamedText }
  }
  return completed ?? (streamedText ? { output_text: streamedText } : undefined)
}

async function normalizeResults(
  modality: ProviderModality,
  payload: Record<string, any>,
  input: NodeRunInput,
  context: ProviderExecutionContext,
  responseId?: string,
  taskId?: string,
): Promise<NodeResult[]> {
  const provider = {
    providerId: input.model.providerId,
    responseId,
    taskId,
    raw: sanitizeRecord(payload),
  }
  const createdAt = Date.now()
  if (modality === 'text') {
    const text = extractText(payload)
    if (!text) throw new ProviderBoundaryError('empty_text_result', 'provider returned no text', false)
    return [{
      id: randomUUID(),
      runId: context.runId,
      type: 'text',
      text,
      provider,
      createdAt,
    }]
  }
  const kind: AssetKind = modality
  const candidates = extractAssets(payload)
  const assets: AssetReference[] = []
  for (const [index, candidate] of candidates.entries()) {
    assets.push(await persistCandidate(
      candidate,
      kind,
      context,
      `${modality}-${index + 1}`,
    ))
  }
  if (!assets.length) {
    throw new ProviderBoundaryError(`empty_${modality}_result`, `provider returned no ${modality}`, true)
  }
  if (modality === 'image') {
    return [{
      id: randomUUID(),
      runId: context.runId,
      type: 'image',
      images: assets,
      provider,
      createdAt,
    }]
  }
  return [{
    id: randomUUID(),
    runId: context.runId,
    type: 'video',
    video: assets[0],
    lastFrame: assets.find((asset) => asset.kind === 'image'),
    provider,
    createdAt,
  }]
}

async function persistCandidate(
  candidate: { url?: string; base64?: string; mimeType?: string; fileName?: string },
  fallbackKind: AssetKind,
  context: ProviderExecutionContext,
  fallbackName: string,
) {
  if (!context.blobs) throw new Error('blob storage is required for generated assets')
  const remote = candidate.url && !candidate.url.startsWith('data:')
    ? await fetch(candidate.url, { signal: context.signal })
    : undefined
  if (remote && !remote.ok) throw new Error(`generated asset download failed with ${remote.status}`)
  const dataUrl = candidate.url?.startsWith('data:') ? candidate.url : undefined
  const parsedData = dataUrl ? parseDataUrl(dataUrl) : undefined
  const bytes = remote
    ? Buffer.from(await remote.arrayBuffer())
    : Buffer.from(candidate.base64 ?? parsedData?.base64 ?? '', 'base64')
  if (!bytes.length) throw new Error('generated asset is empty')
  const contentType = candidate.mimeType
    ?? remote?.headers.get('content-type')
    ?? parsedData?.mimeType
    ?? (fallbackKind === 'image' ? 'image/png' : 'video/mp4')
  const kind: AssetKind = contentType.startsWith('image/') ? 'image' : fallbackKind
  const fileName = candidate.fileName
    ?? `${fallbackName}.${extension(contentType)}`
  const blob = await context.blobs.put({
    ownerId: context.userId,
    fileName,
    contentType,
    size: bytes.length,
    body: bytesBody(bytes),
  })
  return context.blobs.toAssetReference(blob, kind)
}

async function resolveBlobInputs(
  input: NodeRunInput,
  ownerId: string,
  blobs?: BlobStorage,
): Promise<NodeRunInput> {
  if (!blobs) return input
  const resolveAsset = async (asset: AssetReference) => {
    if (!asset.url.startsWith('/api/blobs/')) return asset
    const id = decodeURIComponent(asset.url.slice('/api/blobs/'.length))
    const stat = await blobs.statForOwner(id, ownerId)
    if (!stat) throw new Error(`blob not found: ${id}`)
    const chunks: Buffer[] = []
    for await (const chunk of await blobs.readForOwner(id, ownerId)) chunks.push(Buffer.from(chunk))
    const mimeType = asset.mimeType ?? stat.contentType ?? 'application/octet-stream'
    return { ...asset, url: `data:${mimeType};base64,${Buffer.concat(chunks).toString('base64')}` }
  }
  return {
    ...input,
    attachments: await Promise.all(input.attachments.map(resolveAsset)),
    upstreamResults: await Promise.all(input.upstreamResults.map(async (result) => ({
      ...result,
      assets: await Promise.all(result.assets.map(resolveAsset)),
    }))),
  }
}

function extractText(payload: Record<string, any>) {
  if (typeof payload.text === 'string') return payload.text
  if (typeof payload.output_text === 'string') return payload.output_text
  if (Array.isArray(payload.output)) {
    return payload.output.flatMap((item: any) => item?.content ?? [])
      .map((item: any) => item?.text)
      .filter((item: unknown): item is string => typeof item === 'string')
      .join('')
  }
  return undefined
}

function extractAssets(payload: Record<string, any>) {
  const responseMimeType = imageMimeType(payload.output_format)
  const source = Array.isArray(payload.assets)
    ? payload.assets
    : Array.isArray(payload.images)
      ? payload.images
      : payload.video
        ? [payload.video, ...(payload.lastFrame ? [payload.lastFrame] : [])]
        : Array.isArray(payload.data)
          ? payload.data
          : payload.url || payload.base64
          ? [payload]
          : []
  return source.map((item: unknown) => {
    if (typeof item === 'string') {
      return item.startsWith('http') || item.startsWith('data:') ? { url: item } : { base64: item }
    }
    const record = isRecord(item) ? item : {}
    return {
      url: string(record.url),
      base64: string(record.base64) ?? string(record.b64_json),
      mimeType: string(record.mimeType) ?? string(record.mime_type) ?? responseMimeType,
      fileName: string(record.fileName) ?? string(record.file_name),
    }
  })
}

export function unwrapProviderPayload(value: unknown): Record<string, any> {
  if (!isRecord(value)) return {}
  return isRecord(value.response) ? value.response : value
}

function imageMimeType(outputFormat: unknown) {
  if (outputFormat === 'jpeg' || outputFormat === 'jpg') return 'image/jpeg'
  if (outputFormat === 'png') return 'image/png'
  if (outputFormat === 'webp') return 'image/webp'
  return undefined
}

function parseDataUrl(value: string) {
  const match = value.match(/^data:([^;,]+);base64,(.*)$/s)
  return match ? { mimeType: match[1], base64: match[2] } : undefined
}

function extension(contentType: string) {
  if (contentType.includes('jpeg')) return 'jpg'
  if (contentType.includes('webp')) return 'webp'
  if (contentType.includes('quicktime')) return 'mov'
  return contentType.startsWith('image/') ? 'png' : 'mp4'
}

function bytesBody(bytes: Buffer) {
  return (async function* () { yield bytes })()
}

function string(value: unknown) {
  return typeof value === 'string' && value ? value : undefined
}

function isRecord(value: unknown): value is Record<string, any> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function sanitizeRecord(value: Record<string, any>) {
  return sanitizeProviderPayload(value) as Record<string, unknown>
}

function sanitizeProviderPayload(value: unknown) {
  const serialized = JSON.stringify(value, (key, entry) => {
    if (/(authorization|token|secret|password|api[-_]?key)/i.test(key)) return '[REDACTED]'
    if (/(b64_json|base64)/i.test(key) && typeof entry === 'string') {
      return `[BASE64_IMAGE ${entry.length} chars]`
    }
    return entry
  })
  return serialized === undefined ? value : JSON.parse(serialized)
}

export class ProviderBoundaryError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly retryable: boolean,
  ) {
    super(message)
    this.name = 'ProviderBoundaryError'
  }
}
