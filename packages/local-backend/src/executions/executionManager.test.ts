import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'
import { createDatabase } from '../db/client'
import { PluginManager } from '../plugins/pluginManager'
import { ExecutionManager } from './executionManager'
import { ExecutionRepository } from './executionRepository'

const testDir = dirname(fileURLToPath(import.meta.url))
const fixture = join(testDir, '../plugins/fixtures/test-plugin.mjs')
const closeCallbacks: Array<() => Promise<unknown> | unknown> = []

afterEach(async () => {
  await Promise.allSettled(closeCallbacks.splice(0).map((close) => Promise.resolve(close())))
})

describe('ExecutionManager', () => {
  it('executes registered commands and buffers normalized plugin events', async () => {
    const root = mkdtempSync(join(tmpdir(), 'rvf-execution-'))
    const pluginDir = join(root, 'plugins/test')
    mkdirSync(pluginDir, { recursive: true })
    writeFileSync(join(pluginDir, 'plugin.json'), JSON.stringify({
      id: 'test.plugin',
      name: 'Test',
      version: '1.0.0',
      apiVersion: '1',
      backend: { runtime: 'process', command: process.execPath, args: [fixture] },
      contributes: {
        commands: [{ id: 'test.echo', title: 'Echo' }],
        nodeExecutors: [{ id: 'test.node', nodeTypes: ['test'] }],
      },
    }))

    const plugins = new PluginManager({ pluginDirs: [join(root, 'plugins')] })
    closeCallbacks.push(() => plugins.close())
    await plugins.start()
    const database = createDatabase(join(root, 'test.sqlite'))
    closeCallbacks.push(() => database.sqlite.close())
    const executions = new ExecutionManager(new ExecutionRepository(database), plugins)
    closeCallbacks.unshift(() => executions.close())
    executions.bootstrap()

    const started = executions.startCommand('test.echo', { value: 'hello' })
    const completed = await waitForExecution(executions, started.id)

    expect(completed).toEqual(expect.objectContaining({
      status: 'succeeded',
      result: {
        input: { value: 'hello' },
        tokenConfigured: false,
      },
    }))
    expect(executions.getEvents(started.id).map((event) => event.type)).toEqual([
      'started',
      'delta',
      'completed',
    ])

    const nodeExecution = executions.startNodeExecutor('test.node', { nodeId: 'node-1' })
    const completedNode = await waitForExecution(executions, nodeExecution.id)
    expect(completedNode).toEqual(expect.objectContaining({
      kind: 'node',
      status: 'succeeded',
      result: {
        input: { nodeId: 'node-1' },
        tokenConfigured: false,
      },
    }))

    const slow = executions.startCommand('test.echo', { delayMs: 100 }, 10)
    const timedOut = await waitForExecution(executions, slow.id)
    expect(timedOut).toEqual(expect.objectContaining({
      status: 'timed_out',
      errorCode: 'EXECUTION_TIMED_OUT',
    }))
    expect(executions.getEvents(slow.id).map((event) => event.type)).toEqual([
      'started',
      'failed',
    ])
  })
})

async function waitForExecution(executions: ExecutionManager, executionId: string) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const execution = executions.get(executionId)
    if (execution && ['succeeded', 'failed', 'cancelled', 'timed_out'].includes(execution.status)) return execution
    await new Promise((resolve) => setTimeout(resolve, 10))
  }
  throw new Error('execution did not finish')
}
