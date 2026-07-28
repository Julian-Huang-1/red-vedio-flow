import { afterEach, describe, expect, it, vi } from 'vitest'
import type { MaterialNode } from '@red-video-flow/workflow-core'
import {
  configureWorkflowClient,
  getWorkflowClientTransport,
  runNodeWithAgent,
  type AgentRunEvent,
} from './index'

const originalTransport = getWorkflowClientTransport()

const node: MaterialNode = {
  id: 'node-1',
  position: { x: 0, y: 0 },
  data: {
    materialType: 'text',
    title: '脚本',
    status: 'ready',
    value: { text: '节点内容' },
    messages: [],
  },
}

afterEach(() => {
  configureWorkflowClient(originalTransport)
})

describe('runNodeWithAgent', () => {
  it('forwards chat context and exposes every Agent SSE event', async () => {
    const referencedNode = {
      ...node,
      id: 'node-2',
      data: { ...node.data, title: '人物设定' },
    }
    const streamEvents: AgentRunEvent[] = [
      { type: 'start', agentId: 'codex', bin: '/usr/local/bin/codex', argv: ['exec', '--json'] },
      { type: 'stderr', text: 'Reading prompt from stdin...\n' },
      { type: 'delta', text: '第一段' },
      { type: 'delta', text: '\n\n第二段' },
      { type: 'done', code: 0, output: '第一段\n\n第二段' },
    ]
    let requestBody: Record<string, unknown> | undefined
    const onEvent = vi.fn()
    const onDelta = vi.fn()

    configureWorkflowClient({
      async request(_path, init) {
        requestBody = JSON.parse(String(init?.body))
        return createSseResponse(streamEvents)
      },
    })

    const output = await runNodeWithAgent(
      {
        agentId: 'codex',
        mode: 'chat',
        node,
        upstream: [],
        referencedNodes: [referencedNode],
        edges: [],
        prompt: '继续完善',
        messages: [{ role: 'user', text: '先写人物设定' }],
      },
      { onEvent, onDelta },
    )

    expect(output).toBe('第一段\n\n第二段')
    expect(onEvent.mock.calls.map(([event]) => event.type)).toEqual(['start', 'stderr', 'delta', 'delta', 'done'])
    expect(onDelta.mock.calls.map(([text]) => text)).toEqual(['第一段', '\n\n第二段'])
    expect(requestBody).toMatchObject({
      messages: [{ role: 'user', text: '先写人物设定' }],
      referencedNodes: [{ id: 'node-2' }],
    })
  })

  it('fails a run with a non-zero exit code even when partial output exists', async () => {
    configureWorkflowClient({
      async request() {
        return createSseResponse([
          { type: 'delta', text: '部分输出' },
          { type: 'done', code: 1, output: '部分输出' },
        ])
      },
    })

    await expect(
      runNodeWithAgent({
        agentId: 'codex',
        node,
        upstream: [],
        edges: [],
        prompt: '生成脚本',
      }),
    ).rejects.toThrow('Agent 退出码 1')
  })
})

function createSseResponse(events: AgentRunEvent[]) {
  const body = events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join('')
  return new Response(body, {
    status: 200,
    headers: { 'Content-Type': 'text/event-stream' },
  })
}
