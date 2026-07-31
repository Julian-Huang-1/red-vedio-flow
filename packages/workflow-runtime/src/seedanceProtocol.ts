import type { AssetReference, NodeRunInput } from '@red-video-flow/workflow-core'

export const SEEDANCE_API_PROVIDER = 'doubao-seedance2.0'
export const SEEDANCE_API_MODEL = 'Doubao-seedance2.0'

export function buildSeedanceCreateTaskRequest(input: NodeRunInput) {
  if (input.generationConfig.type !== 'volc-video') {
    throw new Error('Seedance provider requires volc-video generation config')
  }
  const config = input.generationConfig
  const options = { ...config.providerOptions }
  const provider = text(options.provider) ?? SEEDANCE_API_PROVIDER
  const model = text(options.model) ?? SEEDANCE_API_MODEL
  delete options.provider
  delete options.model
  delete options.content
  const upstreamText = input.upstreamResults
    .map((result) => result.text?.trim())
    .filter((value): value is string => Boolean(value))
  const assets = [
    ...input.attachments,
    ...input.upstreamResults.flatMap((result) => result.assets),
  ]
  return compact({
    ...options,
    provider,
    model,
    content: [
      {
        type: 'text',
        text: [...upstreamText, input.prompt.trim()].filter(Boolean).join('\n\n'),
      },
      ...assets.flatMap(seedanceAssetContent),
    ],
    ratio: config.ratio ?? text(config.providerOptions?.ratio),
    duration: config.duration ?? number(config.providerOptions?.duration),
    resolution: config.resolution ?? text(config.providerOptions?.resolution),
    generate_audio: boolean(config.providerOptions?.generate_audio),
    camera_fixed: config.cameraFixed ?? boolean(config.providerOptions?.camera_fixed),
    watermark: config.watermark ?? boolean(config.providerOptions?.watermark),
    seed: config.seed ?? number(config.providerOptions?.seed),
    callback_url: config.callbackUrl ?? text(config.providerOptions?.callback_url),
    return_last_frame: config.returnLastFrame
      ?? boolean(config.providerOptions?.return_last_frame),
  })
}

function seedanceAssetContent(asset: AssetReference): Record<string, unknown>[] {
  if (asset.kind === 'image') {
    return [{
      type: 'image_url',
      image_url: { url: asset.url },
      role: 'reference_image',
    }]
  }
  if (asset.kind === 'video') {
    return [{
      type: 'video_url',
      video_url: { url: asset.url },
      role: 'reference_video',
    }]
  }
  if (asset.mimeType?.startsWith('audio/')) {
    return [{
      type: 'audio_url',
      audio_url: { url: asset.url },
      role: 'reference_audio',
    }]
  }
  return []
}

export function seedanceTaskId(payload: unknown) {
  return findString(payload, ['id', 'task_id', 'taskId', 'cgt_id', 'cgtId'])
}

export function seedanceTaskStatus(payload: unknown) {
  const value = findString(payload, ['status', 'state', 'task_status', 'taskStatus'])?.toLowerCase()
  if (value && ['succeeded', 'success', 'completed', 'complete', 'done'].includes(value)) {
    return 'succeeded' as const
  }
  if (value && ['failed', 'error', 'cancelled', 'canceled'].includes(value)) {
    return 'failed' as const
  }
  return 'running' as const
}

export function seedanceMedia(payload: unknown) {
  return {
    videoUrl: findNamedUrl(payload, ['video_url', 'videoUrl']) ?? findVideoUrl(payload),
    lastFrameUrl: findNamedUrl(payload, [
      'last_frame_url',
      'lastFrameUrl',
      'last_frame_image_url',
      'lastFrameImageUrl',
    ]),
  }
}

export function seedanceFailureMessage(payload: unknown) {
  return findString(payload, ['message', 'error_message', 'fail_reason', 'error'])
    ?? 'Seedance task failed'
}

function compact(value: Record<string, unknown>) {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined))
}

function text(value: unknown) {
  return typeof value === 'string' && value ? value : undefined
}

function boolean(value: unknown) {
  return typeof value === 'boolean' ? value : undefined
}

function number(value: unknown) {
  return typeof value === 'number' ? value : undefined
}

function findString(value: unknown, keys: string[]): string | undefined {
  if (!value || typeof value !== 'object') return undefined
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findString(item, keys)
      if (found) return found
    }
    return undefined
  }
  for (const [key, child] of Object.entries(value)) {
    if (keys.includes(key) && (typeof child === 'string' || typeof child === 'number')) {
      return String(child)
    }
    const found = findString(child, keys)
    if (found) return found
  }
  return undefined
}

function findNamedUrl(value: unknown, keys: string[]) {
  const found = findString(value, keys)
  return found && /^https?:\/\//.test(found) ? found : undefined
}

function findVideoUrl(value: unknown): string | undefined {
  if (typeof value === 'string') {
    return /^https?:\/\//.test(value) && /\.(mp4|mov|webm)(?:[?#]|$)/i.test(value)
      ? value
      : undefined
  }
  if (!value || typeof value !== 'object') return undefined
  for (const child of Array.isArray(value) ? value : Object.values(value)) {
    const found = findVideoUrl(child)
    if (found) return found
  }
  return undefined
}
