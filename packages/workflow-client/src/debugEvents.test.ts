import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  clearWorkflowDebugEvents,
  getWorkflowDebugEventsSnapshot,
  recordWorkflowSseEvent,
  subscribeWorkflowDebugEvents,
} from './debugEvents'
import { createHttpTransport } from './transport'

beforeEach(() => {
  clearWorkflowDebugEvents()
})

afterEach(() => {
  clearWorkflowDebugEvents()
  vi.unstubAllGlobals()
})

describe('workflow debug events', () => {
  it('records request, response, body and notifies subscribers', async () => {
    const listener = vi.fn()
    const unsubscribe = subscribeWorkflowDebugEvents(listener)
    vi.stubGlobal('fetch', vi.fn(async () => new Response(
      JSON.stringify({ ok: true, value: 'response body' }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      },
    )))

    const transport = createHttpTransport({ baseUrl: 'http://127.0.0.1:5176' })
    const response = await transport.request('/api/debug-test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: 'hello' }),
    })
    await response.json()
    await waitForResponseBodyEvent()

    const events = getWorkflowDebugEventsSnapshot()
    expect(events.map((event) => event.kind)).toEqual([
      'http-request',
      'http-response',
      'http-response-body',
    ])
    expect(events[0]).toMatchObject({
      path: '/api/debug-test',
      method: 'POST',
      data: { prompt: 'hello' },
    })
    expect(events[1]).toMatchObject({ status: 200 })
    expect(events[2]).toMatchObject({ data: { ok: true, value: 'response body' } })
    expect(new Set(events.map((event) => event.requestId)).size).toBe(1)
    expect(listener).toHaveBeenCalledTimes(3)
    unsubscribe()
  })

  it('associates SSE events with their HTTP request', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(
      'data: {"type":"delta","text":"hello"}\n\n',
      {
        status: 200,
        headers: { 'Content-Type': 'text/event-stream' },
      },
    )))

    const response = await createHttpTransport().request('/api/run-node', { method: 'POST' })
    recordWorkflowSseEvent(response, '/api/run-node', { type: 'delta', text: 'hello' })

    const events = getWorkflowDebugEventsSnapshot()
    const request = events.find((event) => event.kind === 'http-request')
    const sse = events.find((event) => event.kind === 'sse-event')
    expect(sse?.requestId).toBe(request?.requestId)
    expect(sse?.data).toEqual({ type: 'delta', text: 'hello' })
  })

  it('records network failures before rethrowing them', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => {
      throw new Error('connection refused')
    }))

    await expect(createHttpTransport().request('/api/health')).rejects.toThrow('connection refused')
    expect(getWorkflowDebugEventsSnapshot()).toEqual([
      expect.objectContaining({ kind: 'http-request', path: '/api/health' }),
      expect.objectContaining({
        kind: 'http-error',
        path: '/api/health',
        data: { message: 'connection refused' },
      }),
    ])
  })
})

async function waitForResponseBodyEvent() {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    if (getWorkflowDebugEventsSnapshot().some((event) => event.kind === 'http-response-body')) return
    await new Promise((resolve) => setTimeout(resolve, 0))
  }
}
