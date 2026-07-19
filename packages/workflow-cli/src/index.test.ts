import { spawn } from 'node:child_process'
import http from 'node:http'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  applyWorkflowPatch,
  createMaterialNode,
  type WorkflowDocument,
  type WorkflowPatchInput,
} from '@red-video-flow/workflow-core'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

const workspaceRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..')
const cliBin = join(workspaceRoot, 'packages/workflow-cli/node_modules/.bin/tsx')
const cliEntry = join(workspaceRoot, 'packages/workflow-cli/src/index.ts')
let server: http.Server | undefined
let baseUrl = ''
let workflow: WorkflowDocument
let visualResult: Record<string, unknown>

function createWorkflow(nodes: WorkflowDocument['graph']['nodes'] = []): WorkflowDocument {
  return {
    schemaVersion: 1,
    id: 'workflow-test',
    title: 'CLI Test',
    revision: 1,
    createdAt: 1,
    updatedAt: 1,
    graph: { nodes, edges: [] },
  }
}

async function readJson(req: http.IncomingMessage) {
  const chunks: Buffer[] = []
  for await (const chunk of req) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
  return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')
}

function sendJson(res: http.ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify(body))
}

beforeEach(async () => {
  const source = createMaterialNode({
    id: 'text-source',
    materialType: 'text',
    position: { x: 0, y: 0 },
    title: 'Source',
  })
  source.data.status = 'ready'
  source.data.value = { text: 'source value' }
  workflow = createWorkflow([source])
  visualResult = {
    submitId: 'submit-video',
    taskStatus: 'success',
    genStatus: 'success',
    url: '/api/assets/generated/result.mp4',
    localPath: '/tmp/result.mp4',
    fileName: 'result.mp4',
    mimeType: 'video/mp4',
  }

  server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? '/', 'http://127.0.0.1')
      if (req.method === 'GET' && url.pathname === '/api/workflows') {
        sendJson(res, 200, { workflows: [workflow] })
        return
      }
      if (req.method === 'GET' && url.pathname === `/api/workflows/${workflow.id}`) {
        sendJson(res, 200, workflow)
        return
      }
      if (req.method === 'PATCH' && url.pathname === `/api/workflows/${workflow.id}`) {
        const patch = await readJson(req) as WorkflowPatchInput
        if (patch.baseRevision !== workflow.revision) {
          sendJson(res, 409, { error: 'revision conflict' })
          return
        }
        workflow = {
          ...applyWorkflowPatch(workflow, patch.ops),
          revision: workflow.revision + 1,
          updatedAt: workflow.updatedAt + 1,
        }
        sendJson(res, 200, { workflow, appliedOps: patch.ops.length })
        return
      }
      if (req.method === 'POST' && url.pathname === '/api/query-visual-task') {
        sendJson(res, 200, visualResult)
        return
      }
      sendJson(res, 404, { error: 'not found' })
    } catch (error) {
      sendJson(res, 500, { error: error instanceof Error ? error.message : String(error) })
    }
  })
  await new Promise<void>((resolveListen) => server!.listen(0, '127.0.0.1', resolveListen))
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('test server did not bind a TCP port')
  baseUrl = `http://127.0.0.1:${address.port}`
})

afterEach(async () => {
  if (!server) return
  await new Promise<void>((resolveClose, reject) => {
    server!.close((error) => error ? reject(error) : resolveClose())
  })
  server = undefined
})

function runCli(args: string[]) {
  return new Promise<any>((resolveRun, rejectRun) => {
    const child = spawn(cliBin, [cliEntry, ...args, `--base-url=${baseUrl}`], {
      cwd: workspaceRoot,
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let stdout = ''
    let stderr = ''
    child.stdout.setEncoding('utf8')
    child.stderr.setEncoding('utf8')
    child.stdout.on('data', (chunk: string) => {
      stdout += chunk
    })
    child.stderr.on('data', (chunk: string) => {
      stderr += chunk
    })
    child.on('error', rejectRun)
    child.on('close', (code) => {
      if (code !== 0) {
        rejectRun(new Error(stderr || stdout || `CLI exited with ${code}`))
        return
      }
      resolveRun(JSON.parse(stdout))
    })
  })
}

describe('workflow CLI graph commands', () => {
  it('adds and removes nodes and edges through incremental patches', async () => {
    await runCli([
      'workflow',
      'node',
      'add',
      workflow.id,
      'image',
      '--node-id=image-target',
      '--title=Target',
    ])
    expect(workflow.graph.nodes.map((node) => node.id)).toContain('image-target')

    await runCli([
      'workflow',
      'edge',
      'add',
      workflow.id,
      'text-source',
      'image-target',
      '--edge-id=edge-test',
    ])
    expect(workflow.graph.edges).toEqual([
      { id: 'edge-test', source: 'text-source', target: 'image-target' },
    ])

    await runCli(['workflow', 'edge', 'remove', workflow.id, 'edge-test'])
    expect(workflow.graph.edges).toEqual([])

    await runCli(['workflow', 'node', 'remove', workflow.id, 'image-target'])
    expect(workflow.graph.nodes.map((node) => node.id)).not.toContain('image-target')
  })
})

describe('workflow CLI visual recovery', () => {
  it('queries by submitId and recovers a saved running node', async () => {
    const video = createMaterialNode({
      id: 'video-running',
      materialType: 'video',
      position: { x: 0, y: 0 },
      title: 'Running video',
    })
    video.data.status = 'running'
    video.data.value = { submitId: 'submit-video', provider: 'dreamina' }
    workflow = createWorkflow([video])

    const query = await runCli(['visual', 'query', 'submit-video', '--node-kind=video'])
    expect(query.result).toMatchObject({ taskStatus: 'success', url: '/api/assets/generated/result.mp4' })

    const recovery = await runCli(['workflow', 'recover', workflow.id, '--once'])
    expect(recovery).toMatchObject({ ok: true, recoveredCount: 1, pendingCount: 0 })
    expect(workflow.graph.nodes[0].data).toMatchObject({
      status: 'done',
      value: {
        submitId: 'submit-video',
        provider: 'dreamina',
        url: '/api/assets/generated/result.mp4',
        fileName: 'result.mp4',
      },
    })
  })
})
