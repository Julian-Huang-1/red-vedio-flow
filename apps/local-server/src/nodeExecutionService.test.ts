import { afterEach, describe, expect, it, vi } from 'vitest'
import type {
  AssetReference,
  NodeRunInput,
  StoredBlob,
} from '@red-video-flow/workflow-core'
import { ProviderRegistry } from '@red-video-flow/local-backend'
import { executeWorkflowNodeRun } from './nodeExecutionService'

describe('executeWorkflowNodeRun', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('uses the shared network provider for text runs', async () => {
    const providerFetch = vi.fn(async () => new Response(JSON.stringify({
      id: 'resp-1',
      output: [{
        type: 'message',
        content: [{ type: 'output_text', text: '生成完成' }],
      }],
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }))
    vi.stubGlobal('fetch', providerFetch)
    const events: Array<Record<string, unknown>> = []
    const runtime = fakeRuntime()
    await executeWorkflowNodeRun(runtime as never, {
      runId: 'run-1',
      workflowId: 'workflow-1',
      nodeId: 'node-1',
      input: textInput(),
      signal: new AbortController().signal,
      emit: (event) => events.push(event),
    })

    expect(providerFetch).toHaveBeenCalledWith(
      'https://example.test/text',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ Authorization: 'Bearer test-key' }),
      }),
    )
    expect(events.map((event) => event.type)).toEqual([
      'run',
      'run',
      'result',
      'done',
    ])
    expect(events[2]).toMatchObject({
      type: 'result',
      result: {
        type: 'text',
        text: '生成完成',
        resourceId: expect.any(String),
        provider: { responseId: 'resp-1' },
      },
    })
    expect(runtime.backend.resources.hydrate).toHaveBeenCalled()
    expect(runtime.backend.resources.bind).toHaveBeenCalled()
  })

  it('uses the same image generations boundary as Cowork', async () => {
    const providerFetch = vi.fn(async () => new Response(JSON.stringify({
      data: [{ b64_json: Buffer.from('generated-image').toString('base64') }],
      output_format: 'png',
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }))
    vi.stubGlobal('fetch', providerFetch)
    const events: Array<Record<string, unknown>> = []
    const runtime = fakeRuntime({
      workflow: {
        revision: 7,
        graph: {
          nodes: [{
            id: 'node-1',
            position: { x: 0, y: 0 },
            data: {
              materialType: 'image',
              title: 'Image',
              status: 'empty',
              value: {},
              messages: [],
            },
          }],
          edges: [],
        },
      },
    })
    await executeWorkflowNodeRun(runtime as never, {
      runId: 'run-1',
      workflowId: 'workflow-1',
      nodeId: 'node-1',
      input: {
        prompt: '生成一张图片',
        attachments: [],
        upstreamResults: [],
        model: { providerId: 'openai', modelId: 'gpt-image-2' },
        generationConfig: {
          type: 'openai-image',
          version: 1,
          size: '1024x1024',
          quality: 'high',
        },
      },
      signal: new AbortController().signal,
      emit: (event) => events.push(event),
    })

    expect(providerFetch).toHaveBeenCalledWith(
      'https://example.test/image',
      expect.objectContaining({
        method: 'POST',
        body: expect.stringContaining('"model":"gpt-image-2"'),
      }),
    )
    expect(events.at(-2)).toMatchObject({
      type: 'result',
      result: {
        type: 'image',
        images: [{
          id: expect.any(String),
          url: '/api/blobs/blob-1',
          mimeType: 'image/png',
        }],
      },
    })
    expect(events.at(-1)).toMatchObject({
      type: 'done',
      workflowRevision: 8,
    })
  })
})

function textInput(): NodeRunInput {
  return {
    prompt: '写一个分镜',
    attachments: [],
    upstreamResults: [],
    model: { providerId: 'rednote-maas', modelId: 'GPT-5.6 Sol' },
    generationConfig: {
      type: 'openai-text',
      version: 1,
      stream: false,
    },
  }
}

function fakeRuntime(options: { workflow?: Record<string, unknown> } = {}) {
  let blobSequence = 0
  const workflow = options.workflow
  return {
    config: {
      textProviderUrl: 'https://example.test/text',
      imageProviderUrl: 'https://example.test/image',
      videoProviderUrl: 'https://example.test/video',
      maasApiKey: 'test-key',
    },
    blobStorage: {
      put: vi.fn(async (input: { fileName: string; contentType?: string }) => ({
        id: `blob-${++blobSequence}`,
        fileName: input.fileName,
        contentType: input.contentType,
        size: 15,
        sha256: 'sha',
        createdAt: Date.now(),
      })),
      toAssetReference: (blob: StoredBlob, kind: AssetReference['kind']) => ({
        id: blob.id,
        kind,
        url: `/api/blobs/${blob.id}`,
        name: blob.fileName,
        mimeType: blob.contentType,
        size: blob.size,
      }),
    },
    backend: {
      providers: new ProviderRegistry(),
      workflows: {
        get: () => workflow,
        patch: vi.fn(() => ({ revision: 8 })),
      },
      runs: {
        getNodeRun: () => undefined,
        updateNodeRunTrace: vi.fn(),
      },
      resources: {
        hydrate: vi.fn(),
        bind: vi.fn((input) => ({
          id: 'binding-1',
          ...input,
          createdAt: Date.now(),
        })),
      },
    },
  }
}
