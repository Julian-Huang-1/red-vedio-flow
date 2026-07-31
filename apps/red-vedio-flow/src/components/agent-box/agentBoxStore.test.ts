import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('./piAgentClient', () => ({
  listPiAgentModels: vi.fn(async () => []),
  listPiAgentSessions: vi.fn(async () => []),
  getPiAgentSession: vi.fn(async (id: string) => ({
    id,
    title: '新对话',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    messageCount: 0,
    messages: [],
  })),
  createPiAgentSession: vi.fn(async (id: string) => ({
    id,
    title: '新对话',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    messageCount: 0,
    messages: [],
  })),
  renamePiAgentSession: vi.fn(async () => undefined),
  deletePiAgentSession: vi.fn(async () => undefined),
  abortPiAgentPrompt: vi.fn(async () => undefined),
  streamPiAgentPrompt: vi.fn(async (
    _sessionId: string,
    _input: unknown,
    signal: AbortSignal,
    onEvent: (event: unknown) => void,
  ) => {
    onEvent({ type: 'run-start', runId: 'run-test' })
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        onEvent({ type: 'text-delta', delta: '建议先建立脚本解析节点。' })
        resolve()
      }, 500)
      signal.addEventListener('abort', () => {
        clearTimeout(timeout)
        reject(new DOMException('Aborted', 'AbortError'))
      }, { once: true })
    })
  }),
}))

import {
  selectActiveMessageIds,
  selectCanSubmit,
  selectIsRunning,
  useAgentBoxStore,
} from './agentBoxStore'

describe('agentBoxStore', () => {
  beforeEach(() => {
    useAgentBoxStore.getState().reset()
  })

  afterEach(() => {
    useAgentBoxStore.getState().stop()
    vi.useRealTimers()
  })

  it('manages sessions and history', () => {
    const initialId = useAgentBoxStore.getState().activeSessionId
    useAgentBoxStore.getState().createSession()
    const createdId = useAgentBoxStore.getState().activeSessionId

    expect(createdId).toBeTruthy()
    expect(createdId).not.toBe(initialId)

    useAgentBoxStore.getState().renameSession(createdId!, '新的工作流')
    expect(useAgentBoxStore.getState().sessionsById[createdId!].title).toBe('新的工作流')

    useAgentBoxStore.getState().selectSession(initialId!)
    expect(useAgentBoxStore.getState().activeSessionId).toBe(initialId)

    useAgentBoxStore.getState().deleteSession(createdId!)
    expect(useAgentBoxStore.getState().sessionsById[createdId!]).toBeUndefined()
  })

  it('manages context, mentions, and attachments', () => {
    useAgentBoxStore.getState().clearContext()
    useAgentBoxStore.getState().addContext({
      id: 'node-1',
      kind: 'node',
      title: '脚本节点',
    })
    useAgentBoxStore.getState().mentionNode('node-1', '脚本节点')
    useAgentBoxStore.getState().addAttachment(
      new File(['demo'], 'storyboard.txt', { type: 'text/plain' }),
    )

    const state = useAgentBoxStore.getState()
    expect(state.contextIds).toEqual(['node-1'])
    expect(state.mentionedNodeIds).toEqual(['node-1'])
    expect(state.draft).toContain('@脚本节点')
    expect(state.pendingAttachments[0].name).toBe('storyboard.txt')
    expect(selectCanSubmit(state)).toBe(true)
  })

  it('selects canvas resources without duplicates and sends them with the prompt', async () => {
    const resource = {
      id: 'canvas-resource-image-1',
      resourceId: 'image-1',
      kind: 'image' as const,
      name: '角色参考图.png',
      mimeType: 'image/png',
      size: 1024,
      url: '/resources/image-1',
    }
    useAgentBoxStore.getState().selectAgent('app-builder-agent')
    useAgentBoxStore.getState().addResource(resource)
    useAgentBoxStore.getState().addResource(resource)
    expect(useAgentBoxStore.getState().pendingResources).toHaveLength(1)
    expect(selectCanSubmit(useAgentBoxStore.getState())).toBe(true)

    let receivedResources: unknown[] | undefined
    await useAgentBoxStore.getState().submit(async (_sessionId, input, _signal, onEvent) => {
      receivedResources = input.resources
      onEvent({ type: 'run-start', runId: 'resource-run' })
      onEvent({ type: 'run-end', status: 'stopped' })
    })

    expect(receivedResources).toEqual([resource])
    const state = useAgentBoxStore.getState()
    expect(state.pendingResources).toEqual([])
    const userMessage = Object.values(state.messagesById).find((message) => message.role === 'user')
    expect(userMessage?.resourceIds).toEqual([resource.id])
    expect(state.resourcesById[resource.id]).toEqual(resource)
  })

  it('submits and completes a streaming response', async () => {
    vi.useFakeTimers()
    useAgentBoxStore.getState().setDraft('生成一个工作流')

    const submission = useAgentBoxStore.getState().submit()
    expect(selectIsRunning(useAgentBoxStore.getState())).toBe(true)

    await vi.runAllTimersAsync()
    await submission

    const state = useAgentBoxStore.getState()
    const messageIds = selectActiveMessageIds(state)
    const lastMessage = state.messagesById[messageIds[messageIds.length - 1]]
    expect(state.runStatus).toBe('idle')
    expect(lastMessage.role).toBe('assistant')
    expect(lastMessage.status).toBe('completed')
    expect(lastMessage.text).toContain('脚本解析节点')
  })

  it('stops an active response', async () => {
    vi.useFakeTimers()
    useAgentBoxStore.getState().setDraft('开始生成')
    const submission = useAgentBoxStore.getState().submit()

    await vi.advanceTimersByTimeAsync(400)
    useAgentBoxStore.getState().stop()
    await submission

    const state = useAgentBoxStore.getState()
    const messageIds = selectActiveMessageIds(state)
    const lastMessage = state.messagesById[messageIds[messageIds.length - 1]]
    expect(state.runStatus).toBe('idle')
    expect(lastMessage.status).toBe('stopped')
  })

  it('commits an App Builder artifact when the run completes', async () => {
    useAgentBoxStore.getState().selectAgent('app-builder-agent')
    useAgentBoxStore.getState().setDraft('生成一个计数器')
    await useAgentBoxStore.getState().submit(async (
      _sessionId,
      _input,
      _signal,
      onEvent,
    ) => {
      onEvent({ type: 'run-start', runId: 'run-app-builder' })
      onEvent({
        type: 'artifact',
        artifact: {
          kind: 'html',
          title: '计数器',
          html: '<!doctype html><button>0</button>',
        },
      })
      onEvent({ type: 'run-end', status: 'completed' })
    })

    const sessionId = useAgentBoxStore.getState().activeSessionId!
    const { useAppBuilderStore } = await import('../../pages/app-builder/appBuilderStore')
    expect(useAppBuilderStore.getState().artifactsBySessionId[sessionId]).toMatchObject({
      title: '计数器',
      version: 1,
    })
  })
})
