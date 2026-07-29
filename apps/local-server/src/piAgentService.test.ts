import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { PiAgentService, PiAgentSessionNotFoundError } from './piAgentService.js'

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
