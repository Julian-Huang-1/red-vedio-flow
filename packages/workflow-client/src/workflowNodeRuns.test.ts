import { afterEach, describe, expect, it } from 'vitest'
import type { NodeRunInput } from '@red-video-flow/workflow-core'
import {
  configureWorkflowClient,
  createHttpTransport,
} from './transport'
import { executeWorkflowNodeRun } from './workflowNodeRuns'

describe('executeWorkflowNodeRun client', () => {
  afterEach(() => {
    configureWorkflowClient(createHttpTransport())
  })

  it('projects every SSE event and returns the terminal result', async () => {
    const encoder = new TextEncoder()
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode([
          `data: ${JSON.stringify({ type: 'run', status: 'running', runId: 'run-1' })}`,
          `data: ${JSON.stringify({ type: 'provider-task', runId: 'run-1', taskId: 'task-1' })}`,
          `data: ${JSON.stringify({ type: 'text_delta', runId: 'run-1', delta: 'hello' })}`,
          `data: ${JSON.stringify({ type: 'done', runId: 'run-1', resultIds: ['result-1'] })}`,
          '',
        ].join('\n\n')))
        controller.close()
      },
    })
    configureWorkflowClient({
      request: async () => new Response(stream, {
        status: 200,
        headers: { 'Content-Type': 'text/event-stream' },
      }),
    })
    const events: string[] = []
    const input: NodeRunInput = {
      prompt: 'hello',
      attachments: [],
      upstreamResults: [],
      model: { providerId: 'rednote-maas', modelId: 'GPT-5.6 Sol' },
      generationConfig: { type: 'openai-text', version: 1 },
    }

    const result = await executeWorkflowNodeRun({
      runId: 'run-1',
      workflowId: 'workflow-1',
      nodeId: 'node-1',
      input,
    }, {
      onEvent: (event) => events.push(event.type),
    })

    expect(events).toEqual(['run', 'provider-task', 'text_delta', 'done'])
    expect(result.resultIds).toEqual(['result-1'])
  })
})
