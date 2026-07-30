import { describe, expect, it } from 'vitest'
import type { NodeRunInput } from '@red-video-flow/workflow-core'
import {
  buildOpenAIImageRequest,
  buildVolcVideoCreateTaskRequest,
} from './providerAdapters'

describe('provider request adapters', () => {
  it('keeps OpenAI image advanced options and combines image inputs', () => {
    const input: NodeRunInput = {
      prompt: 'cinematic portrait',
      attachments: [{ id: 'upload', kind: 'image', url: 'https://assets/upload.png' }],
      upstreamResults: [{
        edgeId: 'edge-1',
        nodeId: 'image-1',
        resultId: 'result-1',
        resultType: 'image',
        assets: [{ id: 'upstream', kind: 'image', url: 'https://assets/upstream.png' }],
      }],
      model: { providerId: 'openai', modelId: 'gpt-5' },
      generationConfig: {
        type: 'openai-image',
        version: 1,
        action: 'edit',
        quality: 'high',
        outputFormat: 'webp',
        outputCompression: 80,
        inputFidelity: 'high',
        partialImages: 2,
        previousResponseId: 'resp_previous',
        providerOptions: { custom_future_option: true },
      },
    }

    expect(buildOpenAIImageRequest(input)).toEqual({
      model: 'gpt-5',
      input: [{
        role: 'user',
        content: [
          { type: 'input_text', text: 'cinematic portrait' },
          { type: 'input_image', image_url: 'https://assets/upload.png' },
          { type: 'input_image', image_url: 'https://assets/upstream.png' },
        ],
      }],
      previous_response_id: 'resp_previous',
      tools: [{
        type: 'image_generation',
        action: 'edit',
        quality: 'high',
        output_format: 'webp',
        output_compression: 80,
        input_fidelity: 'high',
        partial_images: 2,
        custom_future_option: true,
      }],
    })
  })

  it('builds an asynchronous Volc video task without losing provider options', () => {
    const input: NodeRunInput = {
      prompt: 'slow camera movement',
      attachments: [{ id: 'first-frame', kind: 'image', url: 'https://assets/frame.png' }],
      upstreamResults: [],
      model: { providerId: 'volcengine-ark', modelId: 'seedance' },
      generationConfig: {
        type: 'volc-video',
        version: 1,
        ratio: '16:9',
        duration: 5,
        returnLastFrame: true,
        callbackUrl: 'https://example.test/callback',
        providerOptions: { service_tier: 'default' },
      },
    }

    expect(buildVolcVideoCreateTaskRequest(input)).toEqual({
      model: 'seedance',
      content: [
        { type: 'text', text: 'slow camera movement  --ratio 16:9  --dur 5' },
        { type: 'image_url', image_url: { url: 'https://assets/frame.png' } },
      ],
      callback_url: 'https://example.test/callback',
      return_last_frame: true,
      service_tier: 'default',
    })
  })
})
