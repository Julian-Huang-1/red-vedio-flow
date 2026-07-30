import { afterEach, describe, expect, it, vi } from 'vitest'
import type { NodeRunInput } from '@red-video-flow/workflow-core'
import { executeWorkflowNodeRun } from './nodeExecutionService'

describe('executeWorkflowNodeRun', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('executes an OpenAI-compatible text run and emits a persisted result event', async () => {
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

    const input: NodeRunInput = {
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
    const events: Array<Record<string, unknown>> = []

    await executeWorkflowNodeRun({
      config: {
        textModelBaseUrl: 'https://example.test/v1',
        maasApiKey: 'test-key',
      },
      backend: {
        assets: {},
        resources: {
          createText: () => ({ id: 'text-resource-1' }),
          bind: vi.fn(),
        },
      },
    } as never, {
      runId: 'run-1',
      workflowId: 'workflow-1',
      nodeId: 'node-1',
      input,
      signal: new AbortController().signal,
      emit: (event) => events.push(event),
    })

    expect(providerFetch).toHaveBeenCalledWith(
      'https://example.test/v1/responses',
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
        provider: { responseId: 'resp-1' },
      },
    })
  })

  it('delegates image runs to the configured visual plugin', async () => {
    const invoke = vi.fn(async () => ({
      url: '/api/assets/generated/run-1/result.png',
      localPath: '/tmp/generated/run-1/result.png',
      fileName: 'result.png',
      mimeType: 'image/png',
      taskStatus: 'success',
      assets: [
        {
          url: '/api/assets/generated/run-1/result-1.png',
          localPath: '/tmp/generated/run-1/result-1.png',
          fileName: 'result-1.png',
          mimeType: 'image/png',
          role: 'output',
        },
        {
          url: '/api/assets/generated/run-1/result-2.png',
          localPath: '/tmp/generated/run-1/result-2.png',
          fileName: 'result-2.png',
          mimeType: 'image/png',
          role: 'output',
        },
      ],
    }))
    const register = vi.fn((asset) => ({
      id: `asset-${asset.fileName}`,
      workflowId: 'workflow-1',
      createdAt: Date.now(),
      ...asset,
    }))
    const patchWorkflow = vi.fn(() => ({ revision: 8 }))
    const events: Array<Record<string, unknown>> = []
    const input: NodeRunInput = {
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
    }

    await executeWorkflowNodeRun({
      backend: {
        visual: { invoke },
        resources: { bind: vi.fn() },
        workflows: {
          get: () => ({ revision: 7 }),
          patch: patchWorkflow,
        },
        assets: {
          generatedDir: '/tmp/generated',
          assetUrlForPath: (path: string) => path,
          register,
        },
      },
    } as never, {
      runId: 'run-1',
      workflowId: 'workflow-1',
      nodeId: 'node-1',
      input,
      signal: new AbortController().signal,
      emit: (event) => events.push(event),
    })

    expect(invoke).toHaveBeenCalledWith(expect.objectContaining({
      modelId: 'gpt-image-2',
      nodeKind: 'image',
      providerOptions: expect.objectContaining({
        size: '1024x1024',
        quality: 'high',
      }),
    }))
    expect(register).toHaveBeenCalled()
    expect(patchWorkflow).toHaveBeenCalledWith(expect.objectContaining({
      id: 'workflow-1',
      baseRevision: 7,
      ops: expect.arrayContaining([
        expect.objectContaining({
          type: 'appendNodeResult',
          nodeId: 'node-1',
          makeCurrent: true,
        }),
      ]),
    }))
    expect(events.at(-2)).toMatchObject({
      type: 'result',
      result: {
        type: 'image',
        images: [
          { id: 'asset-result-1.png' },
          { id: 'asset-result-2.png' },
        ],
      },
    })
    expect(events.at(-1)).toMatchObject({
      type: 'done',
      workflowRevision: 8,
    })
  })
})
