import { describe, expect, it } from 'vitest'
import type { NodeRunInput } from '@red-video-flow/workflow-core'
import { buildProviderRequest, unwrapProviderPayload } from './providers.js'

describe('Cowork provider protocol conversion', () => {
  it('sends the same OpenAI Responses body as local text execution', () => {
    const input: NodeRunInput = {
      model: { modelId: 'GPT-5.6 Sol', providerId: 'rednote-maas' },
      prompt: 'hi',
      attachments: [],
      upstreamResults: [],
      generationConfig: {
        type: 'openai-text',
        version: 1,
        topP: 1,
        temperature: 1,
        reasoningEffort: 'medium',
        parallelToolCalls: true,
        stream: true,
      },
    }

    expect(buildProviderRequest('text', input)).toEqual({
      model: 'GPT-5.6 Sol',
      input: [{
        role: 'user',
        content: [{ type: 'input_text', text: 'hi' }],
      }],
      temperature: 1,
      top_p: 1,
      reasoning: { effort: 'medium' },
      parallel_tool_calls: true,
      stream: true,
    })
  })

  it('converts composer options to a direct image generation request', () => {
    const input: NodeRunInput = {
      model: { modelId: 'gpt-image-2', providerId: 'builtin.visual-gpt-image' },
      prompt: '生成海阔天空的图',
      attachments: [],
      upstreamResults: [],
      generationConfig: {
        type: 'openai-image',
        version: 1,
        providerOptions: {
          action: 'auto',
          outputFormat: 'jpeg',
          outputCompression: 100,
          inputFidelity: 'low',
        },
      },
    }

    expect(buildProviderRequest('image', input)).toEqual({
      model: 'gpt-image-2',
      prompt: '生成海阔天空的图',
      n: 1,
      output_format: 'jpeg',
      output_compression: 100,
    })
  })

  it('uses multipart image edits when composer includes upstream images', () => {
    const input: NodeRunInput = {
      model: { modelId: 'gpt-image-2', providerId: 'builtin.visual-gpt-image' },
      prompt: '生成真人漫画风格',
      attachments: [],
      upstreamResults: [{
        edgeId: 'edge-image',
        nodeId: 'source-image',
        resultId: 'source-result',
        resultType: 'image',
        assets: [{
          id: 'image-1',
          kind: 'image',
          url: 'data:image/jpeg;base64,aW1hZ2U=',
          name: 'source.jpg',
          mimeType: 'image/jpeg',
        }],
      }],
      generationConfig: {
        type: 'openai-image',
        version: 1,
        providerOptions: {
          outputFormat: 'jpeg',
          outputCompression: 100,
          inputFidelity: 'low',
        },
      },
    }

    const request = buildProviderRequest('image', input)
    expect(request).toBeInstanceOf(FormData)
    expect(Array.from((request as FormData).entries()).map(([name, value]) => (
      typeof value === 'string'
        ? [name, value]
        : [name, value.name, value.type, value.size]
    ))).toEqual([
      ['model', 'gpt-image-2'],
      ['prompt', '生成真人漫画风格'],
      ['n', '1'],
      ['output_format', 'jpeg'],
      ['output_compression', '100'],
      ['input_fidelity', 'low'],
      ['image', 'source.jpg', 'image/jpeg', 5],
    ])
  })

  it('unwraps MaaS image responses before extracting image data', () => {
    expect(unwrapProviderPayload({
      response: {
        data: [{ b64_json: 'jpeg-bytes' }],
        output_format: 'jpeg',
      },
      error: null,
    })).toEqual({
      data: [{ b64_json: 'jpeg-bytes' }],
      output_format: 'jpeg',
    })
  })

  it('uses the shared asynchronous Seedance create protocol', () => {
    const input: NodeRunInput = {
      model: {
        providerId: 'builtin.visual-seedance',
        modelId: 'doubao-seedance-2',
      },
      prompt: '生成小孩跑步的视频',
      attachments: [],
      upstreamResults: [],
      generationConfig: {
        type: 'volc-video',
        version: 1,
        providerOptions: {
          duration: 5,
          generate_audio: true,
        },
      },
    }
    expect(buildProviderRequest('video', input)).toMatchObject({
      provider: 'doubao-seedance2.0',
      model: 'Doubao-seedance2.0',
      content: [{ type: 'text', text: '生成小孩跑步的视频' }],
      duration: 5,
      generate_audio: true,
    })
  })
})
