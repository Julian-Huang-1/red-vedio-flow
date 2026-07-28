import { chmodSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { delimiter, join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createMaterialNode } from '@red-video-flow/workflow-core'
import { createLocalBackend, type LocalBackend } from '../context'

const originalPath = process.env.PATH
let backend: LocalBackend | undefined
let dataDir: string | undefined
let binDir: string | undefined

afterEach(() => {
  process.env.PATH = originalPath
  backend?.database.sqlite.close()
  backend = undefined
  if (dataDir) rmSync(dataDir, { recursive: true, force: true })
  if (binDir) rmSync(binDir, { recursive: true, force: true })
  dataDir = undefined
  binDir = undefined
})

function createBackend() {
  dataDir = mkdtempSync(join(tmpdir(), 'red-video-flow-visual-task-test-'))
  backend = createLocalBackend({ dataDir })
  return backend
}

function addVideoNode(localBackend: LocalBackend, input: { status?: 'empty' | 'running'; submitId?: string } = {}) {
  const workflow = localBackend.workflows.create({ title: 'Visual workflow' })
  const node = createMaterialNode({
    id: 'video-1',
    materialType: 'video',
    position: { x: 10, y: 20 },
    title: 'Video node',
  })
  node.data.status = input.status ?? 'empty'
  if (input.submitId) {
    node.data.value = { submitId: input.submitId, provider: 'dreamina', text: '生成中' }
  }
  const patched = localBackend.workflows.patch({
    id: workflow.id,
    baseRevision: workflow.revision,
    ops: [{ type: 'addNode', node }],
  })
  return { workflow: patched, node }
}

function installSuccessfulDreamina() {
  binDir = mkdtempSync(join(tmpdir(), 'red-video-flow-dreamina-task-test-'))
  const binPath = join(binDir, 'dreamina')
  writeFileSync(
    binPath,
    `#!/bin/sh
download_dir=""
for arg in "$@"; do
  case "$arg" in
    --download_dir=*) download_dir="\${arg#--download_dir=}" ;;
  esac
done
mkdir -p "$download_dir"
printf 'fake-video' > "$download_dir/result.mp4"
printf '%s\\n' '{"submit_id":"submit-success","gen_status":"success"}'
`,
  )
  chmodSync(binPath, 0o755)
  process.env.PATH = `${binDir}${delimiter}${originalPath ?? ''}`
}

describe('VisualTaskService', () => {
  it('claims a due task, downloads the result, and projects it exactly once', async () => {
    installSuccessfulDreamina()
    const localBackend = createBackend()
    const { workflow, node } = addVideoNode(localBackend)
    const task = localBackend.visualTasks.start({
      workflowId: workflow.id,
      nodeId: node.id,
      provider: 'dreamina',
      nodeKind: 'video',
    })
    const submitted = localBackend.visualTasks.markSubmitted(task.id, 'submit-success')

    const result = await localBackend.visualTasks.reconcileDue({
      owner: 'test-worker',
      now: submitted.nextPollAt,
      limit: 4,
    })
    const completedTask = localBackend.visualTasks.get(task.id)
    const completedWorkflow = localBackend.workflows.get(workflow.id)

    expect(result).toEqual({ claimed: 1, completed: 1, pending: 0, failed: 0 })
    expect(completedTask).toMatchObject({
      status: 'succeeded',
      attemptCount: 1,
    })
    expect(completedTask?.projectedAt).toBeTypeOf('number')
    expect(completedWorkflow?.graph.nodes[0].data.status).toBe('done')
    expect(completedWorkflow?.graph.nodes[0].data.value).toMatchObject({
      submitId: 'submit-success',
      provider: 'dreamina',
      fileName: 'result.mp4',
      mimeType: 'video/mp4',
    })
    expect(completedWorkflow?.graph.nodes[0].data.messages.filter(
      (message) => message.id === `visual-task:${task.id}:completed`,
    )).toHaveLength(1)
  })

  it('imports legacy running nodes once during startup recovery', () => {
    const localBackend = createBackend()
    const { workflow } = addVideoNode(localBackend, { status: 'running', submitId: 'legacy-submit' })

    expect(localBackend.visualTasks.bootstrap()).toEqual({ imported: 1 })
    expect(localBackend.visualTasks.bootstrap()).toEqual({ imported: 0 })
    expect(localBackend.visualTasks.findBySubmitId('dreamina', 'legacy-submit')).toMatchObject({
      workflowId: workflow.id,
      nodeId: 'video-1',
      status: 'polling',
    })
  })

  it('resumes a persisted polling task after the backend is recreated', async () => {
    installSuccessfulDreamina()
    const firstBackend = createBackend()
    const { workflow, node } = addVideoNode(firstBackend)
    const task = firstBackend.visualTasks.start({
      workflowId: workflow.id,
      nodeId: node.id,
      provider: 'dreamina',
      nodeKind: 'video',
    })
    const submitted = firstBackend.visualTasks.markSubmitted(task.id, 'submit-success')
    const persistedDataDir = dataDir!
    firstBackend.database.sqlite.close()

    backend = createLocalBackend({ dataDir: persistedDataDir })
    expect(backend.visualTasks.bootstrap()).toEqual({ imported: 0 })
    const result = await backend.visualTasks.reconcileDue({
      owner: 'restarted-worker',
      now: submitted.nextPollAt,
    })

    expect(result.completed).toBe(1)
    expect(backend.visualTasks.get(task.id)?.status).toBe('succeeded')
    expect(backend.workflows.get(workflow.id)?.graph.nodes[0].data.status).toBe('done')
  })

  it('does not let an older cancelled task overwrite a rerun', () => {
    const localBackend = createBackend()
    const { workflow, node } = addVideoNode(localBackend)
    const first = localBackend.visualTasks.start({
      workflowId: workflow.id,
      nodeId: node.id,
      provider: 'dreamina',
      nodeKind: 'video',
    })
    localBackend.visualTasks.markSubmitted(first.id, 'submit-old')
    const second = localBackend.visualTasks.start({
      workflowId: workflow.id,
      nodeId: node.id,
      provider: 'dreamina',
      nodeKind: 'video',
    })
    localBackend.visualTasks.markSubmitted(second.id, 'submit-new')

    localBackend.visualTasks.recordInitialResult(first.id, {
      submitId: 'submit-old',
      taskStatus: 'success',
      url: '/api/assets/generated/old.mp4',
    })

    const latestNode = localBackend.workflows.get(workflow.id)?.graph.nodes[0]
    expect(localBackend.visualTasks.get(first.id)?.status).toBe('cancelled')
    expect(latestNode?.data.status).toBe('running')
    expect(latestNode?.data.value.submitId).toBe('submit-new')
    expect(latestNode?.data.value.url).toBeUndefined()
  })

  it('discards an in-flight provider response after the node is rerun', async () => {
    const localBackend = createBackend()
    const { workflow, node } = addVideoNode(localBackend)
    const first = localBackend.visualTasks.start({
      workflowId: workflow.id,
      nodeId: node.id,
      provider: 'dreamina',
      nodeKind: 'video',
    })
    const submitted = localBackend.visualTasks.markSubmitted(first.id, 'submit-old')
    let resolveQuery!: (result: {
      submitId: string
      taskStatus: 'success'
      url: string
    }) => void
    let notifyQueryStarted!: () => void
    const queryStarted = new Promise<void>((resolve) => {
      notifyQueryStarted = resolve
    })
    vi.spyOn(localBackend.visual, 'query').mockImplementation(() => {
      notifyQueryStarted()
      return new Promise((resolve) => {
        resolveQuery = resolve
      })
    })

    const reconciling = localBackend.visualTasks.reconcileDue({
      owner: 'old-worker',
      now: submitted.nextPollAt,
    })
    await queryStarted

    const second = localBackend.visualTasks.start({
      workflowId: workflow.id,
      nodeId: node.id,
      provider: 'dreamina',
      nodeKind: 'video',
    })
    localBackend.visualTasks.markSubmitted(second.id, 'submit-new')
    resolveQuery({
      submitId: 'submit-old',
      taskStatus: 'success',
      url: '/api/assets/generated/old.mp4',
    })
    await reconciling

    const latestNode = localBackend.workflows.get(workflow.id)?.graph.nodes[0]
    expect(localBackend.visualTasks.get(first.id)?.status).toBe('cancelled')
    expect(latestNode?.data.status).toBe('running')
    expect(latestNode?.data.value.submitId).toBe('submit-new')
    expect(latestNode?.data.value.url).toBeUndefined()
  })

  it('keeps polling when the initial query fails after submitId is persisted', () => {
    const localBackend = createBackend()
    const { workflow, node } = addVideoNode(localBackend)
    const task = localBackend.visualTasks.start({
      workflowId: workflow.id,
      nodeId: node.id,
      provider: 'dreamina',
      nodeKind: 'video',
    })
    localBackend.visualTasks.markSubmitted(task.id, 'submit-retry')

    const persisted = localBackend.visualTasks.failSubmission(task.id, new Error('temporary query failure'))

    expect(persisted).toMatchObject({
      status: 'polling',
      submitId: 'submit-retry',
      lastError: 'temporary query failure',
    })
    expect(localBackend.workflows.get(workflow.id)?.graph.nodes[0].data.status).toBe('running')
  })
})
