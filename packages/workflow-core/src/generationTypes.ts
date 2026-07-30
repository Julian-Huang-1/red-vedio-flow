export type AssetKind = 'image' | 'video' | 'file'

export type AssetReference = {
  id: string
  kind: AssetKind
  url: string
  name?: string
  mimeType?: string
  size?: number
  width?: number
  height?: number
  duration?: number
}

export type ModelSelection = {
  providerId: string
  modelId: string
}

export type OpenAITextGenerationConfig = {
  type: 'openai-text'
  version: 1
  temperature?: number
  topP?: number
  maxOutputTokens?: number
  reasoningEffort?: 'none' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh'
  text?: Record<string, unknown>
  tools?: unknown[]
  toolChoice?: unknown
  parallelToolCalls?: boolean
  stream?: boolean
  providerOptions?: Record<string, unknown>
}

export type OpenAIImageGenerationConfig = {
  type: 'openai-image'
  version: 1
  action?: 'auto' | 'generate' | 'edit'
  size?: string
  quality?: string
  background?: 'auto' | 'opaque' | 'transparent'
  outputFormat?: 'png' | 'jpeg' | 'webp'
  outputCompression?: number
  inputFidelity?: 'low' | 'high'
  moderation?: 'auto' | 'low'
  stream?: boolean
  partialImages?: number
  previousResponseId?: string
  providerOptions?: Record<string, unknown>
}

export type VolcVideoGenerationConfig = {
  type: 'volc-video'
  version: 1
  ratio?: string
  duration?: number
  resolution?: string
  frameRate?: number
  cameraFixed?: boolean
  watermark?: boolean
  seed?: number
  returnLastFrame?: boolean
  callbackUrl?: string
  providerOptions?: Record<string, unknown>
}

export type GenerationConfig =
  | OpenAITextGenerationConfig
  | OpenAIImageGenerationConfig
  | VolcVideoGenerationConfig

export type NodeComposerData = {
  prompt: string
  attachments: AssetReference[]
  model: ModelSelection
  generationConfig: GenerationConfig
  updatedAt: number
}

export type ProviderResultContext = {
  providerId: string
  responseId?: string
  taskId?: string
  outputItemId?: string
  raw?: Record<string, unknown>
}

type NodeResultBase = {
  id: string
  runId: string
  createdAt: number
  provider: ProviderResultContext
}

export type TextNodeResult = NodeResultBase & {
  type: 'text'
  text: string
  resourceId?: string
  structuredData?: unknown
}

export type ImageNodeResult = NodeResultBase & {
  type: 'image'
  images: AssetReference[]
}

export type VideoNodeResult = NodeResultBase & {
  type: 'video'
  video: AssetReference
  lastFrame?: AssetReference
}

export type NodeResult = TextNodeResult | ImageNodeResult | VideoNodeResult

export type UpstreamResultReference = {
  edgeId: string
  nodeId: string
  resultId: string
  resultType: NodeResult['type']
  assets: AssetReference[]
  text?: string
}

export type NodeRunInput = {
  prompt: string
  attachments: AssetReference[]
  upstreamResults: UpstreamResultReference[]
  model: ModelSelection
  generationConfig: GenerationConfig
}

export type NodeRunStatus =
  | 'queued'
  | 'running'
  | 'succeeded'
  | 'failed'
  | 'cancelled'
  | 'timed_out'
  | 'interrupted'

export type NodeRun = {
  id: string
  workflowId: string
  nodeId: string
  status: NodeRunStatus
  inputSnapshot: NodeRunInput
  providerTask?: {
    providerId: string
    taskId?: string
    responseId?: string
  }
  resultIds: string[]
  error?: {
    code?: string
    message: string
    retryable: boolean
  }
  createdAt: number
  updatedAt?: number
  startedAt?: number
  finishedAt?: number
}

export type ModelCapabilities = {
  textInput?: boolean
  imageInput?: boolean
  videoInput?: boolean
  textToImage?: boolean
  imageToImage?: boolean
  multiTurnEdit?: boolean
  multipleReferenceImages?: boolean
  partialImageStreaming?: boolean
  textToVideo?: boolean
  imageToVideo?: boolean
  supportsLastFrameOutput?: boolean
  streaming?: boolean
  callback?: boolean
  abort?: boolean
}

type ModelParameterFieldBase = {
  key: string
  label: string
  description?: string
  advanced?: boolean
}

export type ModelParameterField =
  | (ModelParameterFieldBase & {
      type: 'select'
      options: Array<{ label: string; value: string | number | boolean }>
    })
  | (ModelParameterFieldBase & {
      type: 'number'
      min?: number
      max?: number
      step?: number
      placeholder?: string
    })
  | (ModelParameterFieldBase & {
      type: 'boolean'
    })
  | (ModelParameterFieldBase & {
      type: 'string'
      placeholder?: string
    })

export type ModelParameterSchema = {
  fields: ModelParameterField[]
}

export type ModelDefinition = {
  id: string
  providerId: string
  modality: 'text' | 'image' | 'video'
  capabilities: ModelCapabilities
  parameterSchema: ModelParameterSchema
  defaultParameters: Record<string, unknown>
}

export function createDefaultComposer(
  materialType: 'text' | 'image' | 'video',
  now = Date.now(),
): NodeComposerData {
  if (materialType === 'image') {
    return {
      prompt: '',
      attachments: [],
      model: { providerId: 'builtin.visual-gpt-image', modelId: 'gpt-image-2' },
      generationConfig: {
        type: 'openai-image',
        version: 1,
        providerOptions: {
          responseModel: 'gpt-5.6-sol',
          imageGenerationDeployment: 'gpt-image-2',
          action: 'auto',
          size: 'auto',
          quality: 'auto',
          background: 'auto',
          outputFormat: 'png',
          outputCompression: 80,
          inputFidelity: 'low',
          moderation: 'auto',
          stream: false,
          partialImages: 0,
        },
      },
      updatedAt: now,
    }
  }
  if (materialType === 'video') {
    return {
      prompt: '',
      attachments: [],
      model: { providerId: 'builtin.visual-seedance', modelId: 'doubao-seedance-2' },
      generationConfig: {
        type: 'volc-video',
        version: 1,
        providerOptions: {
          ratio: 'adaptive',
          duration: 5,
          resolution: '720p',
          generate_audio: true,
          camera_fixed: false,
          watermark: false,
          seed: -1,
          return_last_frame: false,
        },
      },
      updatedAt: now,
    }
  }
  return {
    prompt: '',
    attachments: [],
    model: { providerId: 'rednote-maas', modelId: 'GPT-5.6 Sol' },
    generationConfig: {
      type: 'openai-text',
      version: 1,
      temperature: 1,
      topP: 1,
      reasoningEffort: 'medium',
      stream: true,
      parallelToolCalls: true,
    },
    updatedAt: now,
  }
}
