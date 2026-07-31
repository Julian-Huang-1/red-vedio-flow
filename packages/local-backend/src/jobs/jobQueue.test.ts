import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { createLocalBackend, type LocalBackend } from '../context'

let backend: LocalBackend | undefined
let dataDir: string | undefined

afterEach(() => {
  backend?.database.sqlite.close()
  if (dataDir) rmSync(dataDir, { recursive: true, force: true })
  backend = undefined
  dataDir = undefined
})

describe('local job queue', () => {
  it('claims a job once and completes it with a worker lease', async () => {
    dataDir = mkdtempSync(join(tmpdir(), 'rvf-queue-'))
    backend = createLocalBackend({ dataDir })
    const queued = await backend.jobs.enqueue({
      type: 'execute-node',
      payload: { runId: 'run-1' },
    })

    const claimed = await backend.jobs.claim('worker-1', 30_000)

    expect(claimed?.id).toBe(queued.id)
    expect(claimed?.attempts).toBe(1)
    expect(await backend.jobs.claim('worker-2', 30_000)).toBeUndefined()
    await backend.jobs.complete(queued.id, 'worker-1')
    expect(await backend.jobs.claim('worker-2', 30_000)).toBeUndefined()
  })

  it('recovers an expired lease', async () => {
    dataDir = mkdtempSync(join(tmpdir(), 'rvf-queue-'))
    backend = createLocalBackend({ dataDir })
    await backend.jobs.enqueue({
      type: 'execute-node',
      payload: { runId: 'run-2' },
    })
    await backend.jobs.claim('dead-worker', 1)

    expect(await backend.jobs.recoverExpired(Date.now() + 10)).toBe(1)
    expect((await backend.jobs.claim('new-worker', 30_000))?.lockedBy).toBe('new-worker')
  })
})
