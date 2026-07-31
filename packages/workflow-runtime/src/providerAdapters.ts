import type {
  AssetReference,
  NodeRunInput,
  OpenAITextGenerationConfig,
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

export type ProviderRequest = OpenAITextRequest

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
