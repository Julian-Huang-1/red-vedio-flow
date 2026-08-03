import type {
  GenerationConfig,
  ModelDefinition,
  ModelParameterField,
  ModelSelection,
} from '@red-video-flow/workflow-core'
import type { VisualModel } from '@red-video-flow/workflow-client'
import type { WorkflowNodeKind } from './workflowTypes'

export type ComposerModelDefinition = ModelDefinition & {
  label: string
  generationConfigType: GenerationConfig['type']
}

const textFields: ModelParameterField[] = [
  { key: 'reasoningEffort', label: '推理强度', type: 'select', options: [
    { label: '不启用', value: 'none' },
    { label: '低', value: 'low' },
    { label: '中', value: 'medium' },
    { label: '高', value: 'high' },
  ] },
  { key: 'temperature', label: '随机性', type: 'number', min: 0, max: 2, step: 0.1 },
  { key: 'topP', label: 'Top P', type: 'number', min: 0, max: 1, step: 0.05, advanced: true },
  { key: 'maxOutputTokens', label: '最大输出 Tokens', type: 'number', min: 1, step: 1, advanced: true },
  { key: 'stream', label: '流式输出', type: 'boolean' },
  { key: 'parallelToolCalls', label: '并行工具调用', type: 'boolean', advanced: true },
]

const textModels = [
  ['GPT-5.6 Sol', 'GPT-5.6 Sol'],
  ['Claude Sonnet 5', 'Claude Sonnet 5'],
  ['claude opus 4.8', 'Claude Opus 4.8'],
].map(([id, label]): ComposerModelDefinition => ({
  id,
  providerId: 'rednote-maas',
  label,
  modality: 'text',
  generationConfigType: 'openai-text',
  capabilities: { textInput: true, imageInput: true, streaming: true },
  defaultParameters: {
    temperature: 1,
    topP: 1,
    stream: true,
    parallelToolCalls: true,
  },
  parameterSchema: { fields: textFields },
}))

export function getComposerModels(
  kind: WorkflowNodeKind,
  visualModels: VisualModel[] = [],
) {
  if (kind === 'text') return textModels
  if (kind === 'audio') return []
  return visualModels
    .filter((model) => supportsKind(model, kind))
    .map((model) => visualModelDefinition(model, kind))
}

export function getComposerModel(
  selection: ModelSelection,
  kind: WorkflowNodeKind,
  visualModels: VisualModel[] = [],
) {
  return getComposerModels(kind, visualModels).find(
    (model) => model.id === selection.modelId && model.providerId === selection.providerId,
  )
}

export function createGenerationConfig(model: ComposerModelDefinition): GenerationConfig {
  if (model.modality !== 'text') {
    return {
      type: model.generationConfigType,
      version: 1,
      providerOptions: { ...model.defaultParameters },
    } as GenerationConfig
  }
  return {
    type: model.generationConfigType,
    version: 1,
    ...model.defaultParameters,
  } as GenerationConfig
}

function visualModelDefinition(
  model: VisualModel,
  kind: 'image' | 'video',
): ComposerModelDefinition {
  const properties = isRecord(model.optionsSchema?.properties)
    ? model.optionsSchema.properties
    : {}
  const fields = Object.entries(properties).flatMap(([key, raw]) => {
    if (!isRecord(raw)) return []
    const field = schemaField(key, raw)
    return field ? [field] : []
  })
  return {
    id: model.id,
    providerId: model.pluginId ?? model.vendor,
    label: model.label,
    modality: kind,
    generationConfigType: kind === 'image' ? 'openai-image' : 'volc-video',
    capabilities: {},
    parameterSchema: { fields },
    defaultParameters: Object.fromEntries(
      Object.entries(properties)
        .filter(([, raw]) => isRecord(raw) && raw.default !== undefined)
        .map(([key, raw]) => [key, (raw as Record<string, unknown>).default]),
    ),
  }
}

function schemaField(key: string, schema: Record<string, unknown>): ModelParameterField | undefined {
  const label = typeof schema.title === 'string' ? schema.title : key
  const description = typeof schema.description === 'string' ? schema.description : undefined
  const advanced = schema.advanced === true
  if (Array.isArray(schema.enum)) {
    const names = Array.isArray(schema.enumNames) ? schema.enumNames.map(String) : []
    return {
      key,
      label,
      description,
      advanced,
      type: 'select',
      options: schema.enum.flatMap((value, index) => (
        typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean'
          ? [{ value, label: names[index] ?? String(value) }]
          : []
      )),
    }
  }
  if (schema.type === 'boolean') return { key, label, description, advanced, type: 'boolean' }
  if (schema.type === 'integer' || schema.type === 'number') {
    return {
      key,
      label,
      description,
      advanced,
      type: 'number',
      min: typeof schema.minimum === 'number' ? schema.minimum : undefined,
      max: typeof schema.maximum === 'number' ? schema.maximum : undefined,
      step: schema.type === 'integer' ? 1 : undefined,
    }
  }
  if (schema.type === 'string') return { key, label, description, advanced, type: 'string' }
  return undefined
}

function supportsKind(model: VisualModel, kind: 'image' | 'video') {
  const capabilities = kind === 'image'
    ? ['text-to-image', 'image-to-image']
    : ['text-to-video', 'image-to-video', 'frames-to-video']
  return model.invokable && model.capabilities.some((capability) => capabilities.includes(capability))
}

function isRecord(value: unknown): value is Record<string, any> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}
