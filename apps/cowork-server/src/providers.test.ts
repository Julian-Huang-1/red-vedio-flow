import { afterEach, describe, expect, it, vi } from 'vitest'
import type { NodeRunInput } from '@red-video-flow/workflow-core'
import { buildProviderRequest, unwrapProviderPayload } from './providers.js'
import {
  NetworkBoundaryProvider,
  resolveBlobInputs,
} from '@red-video-flow/workflow-runtime/network-provider'
import { seedanceTaskStatus } from '@red-video-flow/workflow-runtime'

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

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

  it('downloads a complete image URL as a data URL immediately before image editing', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(
      Buffer.from('image-bytes'),
      { status: 200, headers: { 'Content-Type': 'image/jpeg' } },
    )))
    const input: NodeRunInput = {
      model: { modelId: 'gpt-image-2', providerId: 'builtin.visual-gpt-image' },
      prompt: '编辑图片',
      attachments: [{
        id: 'image-remote',
        kind: 'image',
        url: 'https://sns-img.xhscdn.com/source.jpeg',
        name: 'source.jpeg',
      }],
      upstreamResults: [],
      generationConfig: { type: 'openai-image', version: 1 },
    }

    const resolved = await resolveBlobInputs(input, 'user-1', undefined, true)

    expect(resolved.attachments[0]).toMatchObject({
      url: `data:image/jpeg;base64,${Buffer.from('image-bytes').toString('base64')}`,
      mimeType: 'image/jpeg',
    })
    expect(fetch).toHaveBeenCalledWith(
      new URL('https://sns-img.xhscdn.com/source.jpeg'),
      { signal: undefined },
    )
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

  it('treats an explicit failed Seedance status as terminal even when an id exists', () => {
    expect(seedanceTaskStatus({ id: 'task-failed', status: 'failed' })).toBe('failed')
    expect(seedanceTaskStatus({ id: 'task-cancelled', status: 'cancelled' })).toBe('failed')
  })

  it('resumes an existing Seedance task without creating a duplicate task', async () => {
    vi.useFakeTimers()
    const fetchMock = vi.fn(async (url: string | URL, init?: RequestInit) => {
      if (String(url).endsWith('/task-existing')) {
        return new Response(JSON.stringify({
          id: 'task-existing',
          status: 'succeeded',
          content: { video_url: 'https://cdn.example.com/result.mp4' },
        }), { status: 200, headers: { 'Content-Type': 'application/json' } })
      }
      if (String(url) === 'https://cdn.example.com/result.mp4') {
        return new Response(Buffer.from('video-bytes'), {
          status: 200,
          headers: { 'Content-Type': 'video/mp4' },
        })
      }
      throw new Error(`unexpected fetch: ${String(url)} ${init?.method ?? 'GET'}`)
    })
    vi.stubGlobal('fetch', fetchMock)
    const provider = new NetworkBoundaryProvider(
      'builtin.visual-seedance',
      'video',
      'https://provider.example.com/tasks',
    )
    const execution = provider.execute({
      model: { providerId: 'builtin.visual-seedance', modelId: 'doubao-seedance-2' },
      prompt: '生成视频',
      attachments: [],
      upstreamResults: [],
      generationConfig: { type: 'volc-video', version: 1 },
    }, {
      runId: 'run-1',
      workflowId: 'workflow-1',
      nodeId: 'node-1',
      userId: 'user-1',
      token: 'secret',
      providerTaskId: 'task-existing',
      signal: new AbortController().signal,
      emit: vi.fn(),
      trace: {
        recordProviderInput: vi.fn(),
        recordNetworkRequest: vi.fn(),
        recordResponse: vi.fn(),
      },
      blobs: {
        put: vi.fn(async (input) => ({
          id: 'blob-video',
          fileName: input.fileName,
          contentType: input.contentType,
          size: input.size ?? 0,
          createdAt: Date.now(),
        })),
        toAssetReference: vi.fn((blob, kind) => ({
          id: blob.id,
          kind,
          url: `/api/blobs/${blob.id}`,
          name: blob.fileName,
          mimeType: blob.contentType,
          size: blob.size,
        })),
      } as any,
    })

    await vi.advanceTimersByTimeAsync(2_000)
    const result = await execution

    expect(result.providerTaskId).toBe('task-existing')
    expect(result.results[0]).toMatchObject({ type: 'video' })
    expect(fetchMock.mock.calls.some(([, init]) => init?.method === 'POST')).toBe(false)
    expect(fetchMock).toHaveBeenCalledWith(
      'https://provider.example.com/tasks/task-existing',
      expect.objectContaining({ method: 'GET' }),
    )
  })
})
