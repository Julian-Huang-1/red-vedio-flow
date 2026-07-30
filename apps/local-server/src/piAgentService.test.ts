import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  PiAgentService,
  PiAgentSessionNotFoundError,
  formatPrompt,
  prepareAttachments,
  projectHtmlArtifact,
  projectSessionBranch,
  projectSessionEntry,
} from './piAgentService.js'

describe('PiAgentService sessions', () => {
  let dataDir: string
  let service: PiAgentService

  beforeEach(async () => {
    dataDir = await mkdtemp(join(tmpdir(), 'red-video-flow-pi-'))
    service = new PiAgentService(process.cwd(), dataDir, 'test-key')
  })

  afterEach(async () => {
    await service.close()
    await rm(dataDir, { recursive: true, force: true })
  })

  it('creates, lists, restores, renames, and deletes a persisted session', async () => {
    const created = await service.createSession({
      id: 'session-persisted',
      title: '初始会话',
    })
    expect(created.title).toBe('初始会话')

    const listed = await service.listSessions()
    expect(listed).toHaveLength(1)
    expect(listed[0]).toMatchObject({ id: 'session-persisted', title: '初始会话' })

    const restored = await service.getSession('session-persisted')
    expect(restored.messages).toEqual([])

    const renamed = await service.renameSession('session-persisted', '已重命名')
    expect(renamed.title).toBe('已重命名')

    await service.close()
    service = new PiAgentService(process.cwd(), dataDir, 'test-key')
    expect(await service.getSession('session-persisted')).toMatchObject({
      id: 'session-persisted',
      title: '已重命名',
      messages: [],
    })

    await service.deleteSession('session-persisted')
    expect(await service.listSessions()).toEqual([])
    await expect(service.getSession('session-persisted'))
      .rejects.toBeInstanceOf(PiAgentSessionNotFoundError)
  })
})

describe('PiAgentService message projection', () => {
  it('preserves assistant thinking, tool calls, errors, and tool results', () => {
    const assistant = projectSessionEntry({
      type: 'message',
      id: 'assistant-1',
      parentId: null,
      timestamp: new Date(0).toISOString(),
      message: {
        role: 'assistant',
        content: [
          { type: 'thinking', thinking: '分析中' },
          { type: 'toolCall', id: 'tool-1', name: 'read', arguments: { path: 'a.ts' } },
        ],
        api: 'openai-responses',
        provider: 'rednote-maas',
        model: 'Claude Sonnet 5',
        usage: {
          input: 0,
          output: 0,
          cacheRead: 0,
          cacheWrite: 0,
          totalTokens: 0,
          cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
        },
        stopReason: 'error',
        errorMessage: 'provider failed',
        timestamp: 0,
      },
    })
    expect(assistant[0]).toMatchObject({
      role: 'assistant',
      status: 'error',
      errorMessage: 'provider failed',
      content: [
        { type: 'thinking', thinking: '分析中' },
        { type: 'toolCall', id: 'tool-1', name: 'read' },
      ],
    })

    const toolResult = projectSessionEntry({
      type: 'message',
      id: 'result-1',
      parentId: 'assistant-1',
      timestamp: new Date(1).toISOString(),
      message: {
        role: 'toolResult',
        toolCallId: 'tool-1',
        toolName: 'read',
        content: [{ type: 'text', text: 'file content' }],
        isError: false,
        timestamp: 1,
      },
    })
    expect(toolResult[0]).toMatchObject({
      role: 'toolResult',
      toolCallId: 'tool-1',
      toolName: 'read',
      text: 'file content',
    })
  })

  it('projects compaction and branch summaries', () => {
    expect(projectSessionEntry({
      type: 'compaction',
      id: 'compact-1',
      parentId: null,
      timestamp: new Date(0).toISOString(),
      summary: '压缩摘要',
      firstKeptEntryId: 'message-1',
      tokensBefore: 1200,
    })[0]).toMatchObject({
      role: 'compactionSummary',
      text: '压缩摘要',
      tokensBefore: 1200,
    })

    expect(projectSessionEntry({
      type: 'branch_summary',
      id: 'branch-1',
      parentId: null,
      timestamp: new Date(0).toISOString(),
      summary: '分支摘要',
      fromId: 'message-1',
    })[0]).toMatchObject({
      role: 'branchSummary',
      text: '分支摘要',
      fromId: 'message-1',
    })
  })
})

describe('PiAgentService attachments', () => {
  it('restores persisted attachment metadata on the following user message', () => {
    const messages = projectSessionBranch([
      {
        type: 'custom',
        id: 'attachment-entry',
        parentId: null,
        timestamp: new Date(0).toISOString(),
        customType: 'red-video-flow.attachments',
        data: [{
          name: 'storyboard.txt',
          mimeType: 'text/plain',
          size: 12,
        }],
      },
      {
        type: 'message',
        id: 'user-1',
        parentId: 'attachment-entry',
        timestamp: new Date(1).toISOString(),
        message: {
          role: 'user',
          content: [{ type: 'text', text: '分析附件' }],
          timestamp: 1,
        },
      },
    ])

    expect(messages[0]).toMatchObject({
      id: 'user-1',
      attachments: [{
        name: 'storyboard.txt',
        mimeType: 'text/plain',
        size: 12,
      }],
    })
  })

  it('maps images to Pi image content', () => {
    const result = prepareAttachments([{
      name: 'reference.png',
      mimeType: 'image/png',
      size: 3,
      data: Buffer.from('png').toString('base64'),
    }])

    expect(result).toEqual({
      images: [{
        type: 'image',
        data: Buffer.from('png').toString('base64'),
        mimeType: 'image/png',
      }],
      textAttachments: [],
    })
  })

  it('decodes text files and appends them to the prompt', () => {
    const { textAttachments } = prepareAttachments([{
      name: 'storyboard.txt',
      mimeType: 'text/plain',
      size: 12,
      data: Buffer.from('第一幕：日出').toString('base64'),
    }])

    expect(formatPrompt('继续创作', undefined, textAttachments)).toBe(
      '继续创作\n\nAttached file: storyboard.txt\n\n第一幕：日出',
    )
  })

  it('rejects unsupported binary files', () => {
    expect(() => prepareAttachments([{
      name: 'archive.zip',
      mimeType: 'application/zip',
      size: 3,
      data: Buffer.from('zip').toString('base64'),
    }])).toThrow('暂不支持该附件类型')
  })
})

describe('PiAgentService App Builder artifacts', () => {
  it('adds App Builder instructions and the current artifact to the prompt', () => {
    const prompt = formatPrompt(
      '把按钮改成红色',
      undefined,
      [],
      {
        type: 'app-builder',
        currentArtifact: {
          id: 'artifact-1',
          version: 2,
          html: '<!doctype html><button>提交</button>',
        },
      },
    )

    expect(prompt).toContain('You are operating in App Builder mode.')
    expect(prompt).toContain('artifact-1')
    expect(prompt).toContain('<button>提交</button>')
    expect(prompt).toContain('call publish_html exactly once')
  })

  it('projects publish_html tool details into an artifact event payload', () => {
    expect(projectHtmlArtifact('publish_html', {
      details: {
        artifact: {
          kind: 'html',
          title: '作品集',
          html: '<!doctype html><title>作品集</title>',
        },
      },
    })).toEqual({
      kind: 'html',
      title: '作品集',
      html: '<!doctype html><title>作品集</title>',
    })
    expect(projectHtmlArtifact('read', {})).toBeUndefined()
  })
})
