import { describe, expect, it } from 'vitest'
import { PersistenceFlushQueue } from './persistenceFlushQueue'

describe('PersistenceFlushQueue', () => {
  it('waits for all queued persistence operations', async () => {
    const queue = new PersistenceFlushQueue()
    const completed: string[] = []
    queue.add(Promise.resolve().then(() => {
      completed.push('workflow')
    }))
    queue.add(Promise.resolve().then(() => {
      completed.push('run')
    }))

    await queue.flush()

    expect(completed.sort()).toEqual(['run', 'workflow'])
  })

  it('reports a persistence failure once and accepts later operations', async () => {
    const queue = new PersistenceFlushQueue()
    queue.add(Promise.reject(new Error('database unavailable')))

    await expect(queue.flush()).rejects.toThrow('database unavailable')

    queue.add(Promise.resolve())
    await expect(queue.flush()).resolves.toBeUndefined()
  })
})
