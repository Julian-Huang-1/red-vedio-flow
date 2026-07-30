import type {
  AssetReference,
  NodeRunInput,
  OpenAIImageGenerationConfig,
  OpenAITextGenerationConfig,
  UpstreamResultReference,
  VolcVideoGenerationConfig,
} from '@red-video-flow/workflow-core'

export type OpenAIInputContent =
  | { type: 'input_text'; text: string }
  | { type: 'input_image'; image_url: string }
  | { type: 'input_file'; file_url: string }

export type OpenAITextRequest = Record<string, unknown> & {
  model: string
  input: Array<{
    role: 'user'
    content: OpenAIInputContent[]
  }>
}

export type OpenAIImageRequest = Record<string, unknown> & {
  model: string
  input: Array<{
    role: 'user'
    content: OpenAIInputContent[]
  }> | string
  tools: Array<Record<string, unknown> & { type: 'image_generation' }>
  previous_response_id?: string
  stream?: boolean
}

export type VolcVideoContent =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string } }
  | (Record<string, unknown> & { type: string })

export type VolcVideoCreateTaskRequest = Record<string, unknown> & {
  model: string
  content: VolcVideoContent[]
  callback_url?: string
  return_last_frame?: boolean
}

export type ProviderRequest =
  | OpenAITextRequest
  | OpenAIImageRequest
  | VolcVideoCreateTaskRequest

export type ProviderSubmission = {
  providerId: string
  responseId?: string
  taskId?: string
  raw: unknown
}

export type ProviderTaskResult = {
  status: 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled'
  raw: unknown
}

export interface NodeExecutionAdapter<
  TRequest extends ProviderRequest = ProviderRequest,
> {
  buildRequest(input: NodeRunInput): TRequest
  submit(input: NodeRunInput): Promise<ProviderSubmission>
  poll?(submission: ProviderSubmission): Promise<ProviderTaskResult>
  abort?(submission: ProviderSubmission): Promise<void>
}

export function buildOpenAITextRequest(input: NodeRunInput): OpenAITextRequest {
  assertConfig(input, 'openai-text')
  const config = input.generationConfig
  return removeUndefined({
    ...config.providerOptions,
    model: input.model.modelId,
    input: [{ role: 'user' as const, content: buildOpenAIContent(input) }],
    temperature: config.temperature,
    top_p: config.topP,
    max_output_tokens: config.maxOutputTokens,
    reasoning: config.reasoningEffort ? { effort: config.reasoningEffort } : undefined,
    text: config.text,
    tools: config.tools,
    tool_choice: config.toolChoice,
    parallel_tool_calls: config.parallelToolCalls,
    stream: config.stream,
  }) as OpenAITextRequest
}

export function buildOpenAIImageRequest(input: NodeRunInput): OpenAIImageRequest {
  assertConfig(input, 'openai-image')
  const config = input.generationConfig
  const tool = removeUndefined({
    ...config.providerOptions,
    type: 'image_generation' as const,
    action: config.action,
    size: config.size,
    quality: config.quality,
    background: config.background,
    output_format: config.outputFormat,
    output_compression: config.outputCompression,
    input_fidelity: config.inputFidelity,
    moderation: config.moderation,
    partial_images: config.partialImages,
  })

  return removeUndefined({
    model: input.model.modelId,
    input: [{ role: 'user' as const, content: buildOpenAIContent(input) }],
    tools: [tool],
    previous_response_id: config.previousResponseId,
    stream: config.stream,
  }) as OpenAIImageRequest
}

export function buildVolcVideoCreateTaskRequest(
  input: NodeRunInput,
): VolcVideoCreateTaskRequest {
  assertConfig(input, 'volc-video')
  const config = input.generationConfig
  const providerOptions = { ...config.providerOptions }
  const extraContent = Array.isArray(providerOptions.content)
    ? providerOptions.content as VolcVideoContent[]
    : []
  delete providerOptions.content

  return removeUndefined({
    ...providerOptions,
    model: input.model.modelId,
    content: [
      {
        type: 'text' as const,
        text: buildVideoPrompt(input.prompt, input.upstreamResults, config),
      },
      ...imageAssets(input).map((asset) => ({
        type: 'image_url' as const,
        image_url: { url: asset.url },
      })),
      ...extraContent,
    ],
    callback_url: config.callbackUrl,
    return_last_frame: config.returnLastFrame,
  }) as VolcVideoCreateTaskRequest
}

function buildOpenAIContent(input: NodeRunInput): OpenAIInputContent[] {
  const upstreamText = input.upstreamResults
    .map((result) => result.text?.trim())
    .filter((text): text is string => Boolean(text))
  const text = [...upstreamText, input.prompt.trim()].filter(Boolean).join('\n\n')
  const content: OpenAIInputContent[] = []
  if (text) content.push({ type: 'input_text', text })
  for (const asset of allAssets(input)) {
    if (asset.kind === 'image') {
      content.push({ type: 'input_image', image_url: asset.url })
    } else {
      content.push({ type: 'input_file', file_url: asset.url })
    }
  }
  return content
}

function buildVideoPrompt(
  prompt: string,
  upstreamResults: UpstreamResultReference[],
  config: VolcVideoGenerationConfig,
) {
  const upstreamText = upstreamResults
    .map((result) => result.text?.trim())
    .filter((text): text is string => Boolean(text))
  const flags = [
    config.ratio ? `--ratio ${config.ratio}` : '',
    config.duration ? `--dur ${config.duration}` : '',
    config.resolution ? `--resolution ${config.resolution}` : '',
    config.frameRate ? `--fps ${config.frameRate}` : '',
    config.cameraFixed === undefined ? '' : `--camerafixed ${config.cameraFixed}`,
    config.watermark === undefined ? '' : `--watermark ${config.watermark}`,
    config.seed === undefined ? '' : `--seed ${config.seed}`,
  ].filter(Boolean)
  return [[...upstreamText, prompt.trim()].filter(Boolean).join('\n\n'), ...flags]
    .filter(Boolean)
    .join('  ')
}

function imageAssets(input: NodeRunInput) {
  return allAssets(input).filter((asset) => asset.kind === 'image')
}

function allAssets(input: NodeRunInput) {
  return dedupeAssets([
    ...input.attachments,
    ...input.upstreamResults.flatMap((result) => result.assets),
  ])
}

function dedupeAssets(assets: AssetReference[]) {
  const seen = new Set<string>()
  return assets.filter((asset) => {
    const key = asset.id || asset.url
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function assertConfig<T extends NodeRunInput['generationConfig']['type']>(
  input: NodeRunInput,
  type: T,
): asserts input is NodeRunInput & {
  generationConfig: Extract<NodeRunInput['generationConfig'], { type: T }>
} {
  if (input.generationConfig.type !== type) {
    throw new Error(`Expected ${type} generation config, received ${input.generationConfig.type}`)
  }
}

function removeUndefined<T extends Record<string, unknown>>(value: T) {
  return Object.fromEntries(
    Object.entries(value).filter(([, item]) => item !== undefined),
  ) as Partial<T>
}
