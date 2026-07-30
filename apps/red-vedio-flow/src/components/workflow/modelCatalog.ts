import type {
  GenerationConfig,
  ModelDefinition,
  ModelSelection,
} from '@red-video-flow/workflow-core'
import type { WorkflowNodeKind } from './workflowTypes'

export type ComposerModelDefinition = ModelDefinition & {
  label: string
  generationConfigType: GenerationConfig['type']
}

export const composerModels: ComposerModelDefinition[] = [
  {
    id: 'gpt-5',
    providerId: 'openai',
    label: 'GPT-5',
    modality: 'text',
    generationConfigType: 'openai-text',
    capabilities: { textInput: true, imageInput: true, streaming: true },
    defaultParameters: {
      temperature: 1,
      topP: 1,
      reasoningEffort: 'medium',
      stream: true,
      parallelToolCalls: true,
    },
    parameterSchema: {
      fields: [
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
      ],
    },
  },
  {
    id: 'gpt-image-2',
    providerId: 'openai',
    label: 'GPT Image 2',
    modality: 'image',
    generationConfigType: 'openai-image',
    capabilities: {
      textInput: true,
      imageInput: true,
      textToImage: true,
      imageToImage: true,
      multiTurnEdit: true,
      multipleReferenceImages: true,
      partialImageStreaming: true,
      streaming: true,
    },
    defaultParameters: {
      action: 'auto',
      size: 'auto',
      quality: 'auto',
      background: 'auto',
      outputFormat: 'png',
      inputFidelity: 'low',
      moderation: 'auto',
      stream: false,
      partialImages: 0,
    },
    parameterSchema: {
      fields: [
        { key: 'action', label: '生成方式', type: 'select', options: [
          { label: '自动判断', value: 'auto' },
          { label: '生成', value: 'generate' },
          { label: '编辑', value: 'edit' },
        ] },
        { key: 'size', label: '尺寸', type: 'select', options: [
          { label: '自动', value: 'auto' },
          { label: '正方形 1024×1024', value: '1024x1024' },
          { label: '横图 1536×1024', value: '1536x1024' },
          { label: '竖图 1024×1536', value: '1024x1536' },
        ] },
        { key: 'quality', label: '质量', type: 'select', options: [
          { label: '自动', value: 'auto' },
          { label: '低', value: 'low' },
          { label: '中', value: 'medium' },
          { label: '高', value: 'high' },
        ] },
        { key: 'background', label: '背景', type: 'select', options: [
          { label: '自动', value: 'auto' },
          { label: '不透明', value: 'opaque' },
          { label: '透明', value: 'transparent' },
        ] },
        { key: 'outputFormat', label: '输出格式', type: 'select', options: [
          { label: 'PNG', value: 'png' },
          { label: 'JPEG', value: 'jpeg' },
          { label: 'WebP', value: 'webp' },
        ] },
        { key: 'outputCompression', label: '压缩质量', type: 'number', min: 0, max: 100, step: 1, advanced: true },
        { key: 'inputFidelity', label: '输入保真度', type: 'select', advanced: true, options: [
          { label: '低', value: 'low' },
          { label: '高', value: 'high' },
        ] },
        { key: 'moderation', label: '内容审核', type: 'select', advanced: true, options: [
          { label: '自动', value: 'auto' },
          { label: '较低限制', value: 'low' },
        ] },
        { key: 'stream', label: '流式预览', type: 'boolean', advanced: true },
        { key: 'partialImages', label: '局部图片数量', type: 'number', min: 0, max: 3, step: 1, advanced: true },
      ],
    },
  },
  {
    id: 'doubao-seedance-2',
    providerId: 'doubao-seedance2.0',
    label: 'Doubao Seedance 2.0',
    modality: 'video',
    generationConfigType: 'volc-video',
    capabilities: {
      textInput: true,
      imageInput: true,
      videoInput: true,
      textToVideo: true,
      imageToVideo: true,
      supportsLastFrameOutput: true,
      callback: true,
      abort: true,
    },
    defaultParameters: {
      ratio: 'adaptive',
      duration: 5,
      resolution: '720p',
      cameraFixed: false,
      watermark: false,
      returnLastFrame: false,
    },
    parameterSchema: {
      fields: [
        { key: 'ratio', label: '画面比例', type: 'select', options: [
          { label: '自适应', value: 'adaptive' },
          { label: '16:9', value: '16:9' },
          { label: '9:16', value: '9:16' },
          { label: '1:1', value: '1:1' },
        ] },
        { key: 'duration', label: '时长（秒）', type: 'number', min: 1, max: 12, step: 1 },
        { key: 'resolution', label: '分辨率', type: 'select', options: [
          { label: '480p', value: '480p' },
          { label: '720p', value: '720p' },
          { label: '1080p', value: '1080p' },
        ] },
        { key: 'frameRate', label: '帧率', type: 'number', min: 1, max: 60, step: 1, advanced: true },
        { key: 'cameraFixed', label: '固定镜头', type: 'boolean', advanced: true },
        { key: 'watermark', label: '添加水印', type: 'boolean', advanced: true },
        { key: 'seed', label: '随机种子', type: 'number', min: -1, step: 1, advanced: true },
        { key: 'returnLastFrame', label: '返回尾帧', type: 'boolean' },
        { key: 'callbackUrl', label: '回调地址', type: 'string', placeholder: 'https://…', advanced: true },
      ],
    },
  },
]

export function getComposerModels(kind: WorkflowNodeKind) {
  return composerModels.filter((model) => model.modality === kind)
}

export function getComposerModel(selection: ModelSelection) {
  return composerModels.find(
    (model) => model.id === selection.modelId && model.providerId === selection.providerId,
  )
}

export function createGenerationConfig(model: ComposerModelDefinition): GenerationConfig {
  return {
    type: model.generationConfigType,
    version: 1,
    ...model.defaultParameters,
  } as GenerationConfig
}
