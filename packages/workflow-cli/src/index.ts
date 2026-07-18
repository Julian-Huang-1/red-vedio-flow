#!/usr/bin/env tsx
import {
  configureWorkflowClient,
  completeWorkflowNodeRun,
  createHttpTransport,
  failWorkflowNodeRun,
  fetchLocalAgents,
  fetchWorkflow,
  fetchWorkflows,
  heartbeatWorkflowNodeRun,
  patchWorkflow,
  runNodeWithAgent,
  runVisualNode,
  startWorkflowNodeRun,
} from '@red-video-flow/workflow-client'
import { createGeneratedValue, getUpstreamNodes, type MaterialMessage, type MaterialNode, type MaterialValue, type NodeStatus, type WorkflowPatchOperation, type WorkflowDocument } from '@red-video-flow/workflow-core'

type CliOptions = {
  baseUrl: string
  baseRevision?: number
}

type ParsedArgs = {
  positionals: string[]
  flags: Record<string, string | true>
}

const statuses = new Set<NodeStatus>(['empty', 'ready', 'running', 'done', 'error'])

main().catch((error) => {
  printJson({ ok: false, error: error instanceof Error ? error.message : String(error) })
  process.exitCode = 1
})

async function main() {
  const parsed = parseArgs(process.argv.slice(2))
  const options: CliOptions = {
    baseUrl: String(parsed.flags['base-url'] ?? process.env.RED_VIDEO_FLOW_BASE_URL ?? 'http://127.0.0.1:5176'),
    baseRevision: readNumberFlag(parsed.flags['base-revision']),
  }

  configureWorkflowClient(createHttpTransport({ baseUrl: options.baseUrl }))

  const [scope, command, ...args] = parsed.positionals
  if (!scope || scope === 'help' || parsed.flags.help) {
    printHelp()
    return
  }
  if (scope !== 'workflow') throw new Error(`unknown scope: ${scope}`)

  if (command === 'list') {
    const result = await fetchWorkflows()
    printJson({ ok: true, workflows: result.workflows })
    return
  }

  if (command === 'get') {
    const workflowId = required(args[0], 'workflowId')
    const workflow = await fetchWorkflow(workflowId)
    printJson({ ok: true, workflow })
    return
  }

  if (command === 'upstream') {
    const workflowId = required(args[0], 'workflowId')
    const nodeId = required(args[1], 'nodeId')
    const workflow = await fetchWorkflow(workflowId)
    printJson({ ok: true, upstream: getUpstreamNodes(workflow.graph.nodes, workflow.graph.edges, nodeId), revision: workflow.revision })
    return
  }

  if (command !== 'node') throw new Error(`unknown workflow command: ${command}`)
  await runNodeCommand(args, parsed.flags, options)
}

async function runNodeCommand(args: string[], flags: ParsedArgs['flags'], options: CliOptions) {
  const command = required(args[0], 'node command')
  const workflowId = required(args[1], 'workflowId')
  const nodeId = required(args[2], 'nodeId')

  if (command === 'get') {
    const workflow = await fetchWorkflow(workflowId)
    const node = workflow.graph.nodes.find((item) => item.id === nodeId)
    if (!node) throw new Error(`node not found: ${nodeId}`)
    printJson({ ok: true, node, revision: workflow.revision })
    return
  }

  if (command === 'set-status') {
    const status = required(args[3] ?? readStringFlag(flags.status), 'status') as NodeStatus
    if (!statuses.has(status)) throw new Error(`invalid status: ${status}`)
    await commitPatch(workflowId, [{ type: 'setNodeStatus', nodeId, status }], options)
    return
  }

  if (command === 'set-value') {
    await commitPatch(workflowId, [{ type: 'setNodeValue', nodeId, value: readValue(flags) }], options)
    return
  }

  if (command === 'append-message') {
    await commitPatch(workflowId, [{ type: 'appendNodeMessage', nodeId, message: readMessage(flags) }], options)
    return
  }

  if (command === 'run') {
    await runWorkflowNodeFromCli(workflowId, nodeId, flags, options)
    return
  }

  if (command === 'start') {
    const prompt = required(readStringFlag(flags.prompt), 'prompt')
    const response = await startWorkflowNodeRun({
      workflowId,
      nodeId,
      prompt,
      baseRevision: options.baseRevision,
    })
    printJson({ ok: true, run: response.run, runId: response.run.id, workflow: response.workflow, revision: response.workflow.revision })
    return
  }

  if (command === 'heartbeat') {
    const runId = required(readStringFlag(flags['run-id']), 'run-id')
    const response = await heartbeatWorkflowNodeRun({ workflowId, nodeId, runId })
    printJson({ ok: true, run: response.run, runId: response.run.id })
    return
  }

  if (command === 'complete') {
    const runId = required(readStringFlag(flags['run-id']), 'run-id')
    const message = readStringFlag(flags.message) ?? '生成完成'
    const response = await completeWorkflowNodeRun({
      workflowId,
      nodeId,
      runId,
      baseRevision: options.baseRevision,
      value: readValue(flags),
      message,
    })
    printJson({ ok: true, run: response.run, runId: response.run.id, workflow: response.workflow, revision: response.workflow.revision })
    return
  }

  if (command === 'fail') {
    const runId = required(readStringFlag(flags['run-id']), 'run-id')
    const message = required(readStringFlag(flags.message), 'message')
    const response = await failWorkflowNodeRun({
      workflowId,
      nodeId,
      runId,
      baseRevision: options.baseRevision,
      message,
    })
    printJson({ ok: true, run: response.run, runId: response.run.id, workflow: response.workflow, revision: response.workflow.revision })
    return
  }

  throw new Error(`unknown node command: ${command}`)
}

async function runWorkflowNodeFromCli(
  workflowId: string,
  nodeId: string,
  flags: ParsedArgs['flags'],
  options: CliOptions,
) {
  const prompt = required(readStringFlag(flags.prompt), 'prompt')
  const heartbeatIntervalMs = readNumberFlag(flags['heartbeat-interval-ms']) ?? 15_000
  const started = await startWorkflowNodeRun({
    workflowId,
    nodeId,
    prompt,
    baseRevision: options.baseRevision,
  })
  const runId = started.run.id
  const heartbeat = startHeartbeatLoop(workflowId, nodeId, runId, heartbeatIntervalMs)

  try {
    const workflow = await fetchWorkflow(workflowId)
    const node = findNode(workflow, nodeId)
    const upstream = getUpstreamNodes(workflow.graph.nodes, workflow.graph.edges, nodeId)
    const result = await executeNode({
      workflow,
      node,
      upstream,
      prompt,
      flags,
      options,
    })
    heartbeat.stop()

    const completed = await completeWorkflowNodeRun({
      workflowId,
      nodeId,
      runId,
      value: result.value,
      status: result.status,
      message: result.message,
    })
    printJson({
      ok: true,
      run: completed.run,
      runId,
      result,
      workflow: completed.workflow,
      revision: completed.workflow.revision,
    })
  } catch (error) {
    heartbeat.stop()
    const message = error instanceof Error ? error.message : String(error)
    try {
      const failed = await failWorkflowNodeRun({ workflowId, nodeId, runId, message })
      printJson({ ok: false, run: failed.run, runId, workflow: failed.workflow, revision: failed.workflow.revision, error: message })
    } catch {
      printJson({ ok: false, runId, error: message })
    }
    process.exitCode = 1
  }
}

async function executeNode(input: {
  workflow: WorkflowDocument
  node: MaterialNode
  upstream: MaterialNode[]
  prompt: string
  flags: ParsedArgs['flags']
  options: CliOptions
}) {
  const { workflow, node, upstream, prompt, flags, options } = input

  if (node.data.materialType === 'image' || node.data.materialType === 'video') {
    const result = await runVisualNode({
      node,
      upstream,
      edges: workflow.graph.edges,
      prompt,
      modelId: readStringFlag(flags['model-id']),
    })
    const status: 'done' | 'running' = result.url ? 'done' : 'running'
    const message = result.url ? '已通过视觉模型生成素材。' : result.text || `已提交视觉生成任务${result.submitId ? `：${result.submitId}` : ''}`
    return {
      status,
      value: {
        ...node.data.value,
        text: result.url ? undefined : message,
        url: result.url,
        localPath: result.localPath,
        fileName: result.fileName,
        mimeType: result.mimeType,
        submitId: result.submitId,
        provider: 'dreamina',
      },
      message,
    }
  }

  const agentId = readStringFlag(flags['agent-id']) ?? (await pickDefaultAgentId())
  const output = await runNodeWithAgent(
    {
      agentId,
      node,
      upstream,
      edges: workflow.graph.edges,
      prompt,
      mode: 'node',
    },
  )

  return {
    status: 'done' as const,
    value: createGeneratedValue(node, output),
    message: `已通过 ${agentId} 完成生成。`,
  }
}

async function pickDefaultAgentId() {
  const agents = await fetchLocalAgents()
  const agent = agents.agents.find((item) => item.invokable)
  if (!agent) throw new Error('没有可调用的本地 Agent，请传入 --agent-id 或先配置 Agent')
  return agent.id
}

function startHeartbeatLoop(workflowId: string, nodeId: string, runId: string, intervalMs: number) {
  if (intervalMs <= 0) return { stop: () => undefined }

  const timer = setInterval(() => {
    void heartbeatWorkflowNodeRun({ workflowId, nodeId, runId }).catch(() => undefined)
  }, intervalMs)
  timer.unref()
  return {
    stop: () => clearInterval(timer),
  }
}

function findNode(workflow: WorkflowDocument, nodeId: string) {
  const node = workflow.graph.nodes.find((item) => item.id === nodeId)
  if (!node) throw new Error(`node not found: ${nodeId}`)
  return node
}

async function commitPatch(workflowId: string, ops: WorkflowPatchOperation[], options: CliOptions) {
  const baseRevision = options.baseRevision ?? (await fetchWorkflow(workflowId)).revision
  const result = await patchWorkflow(workflowId, { baseRevision, ops })
  printJson({ ok: true, workflow: result.workflow, revision: result.workflow.revision, appliedOps: result.appliedOps })
}

function readValue(flags: ParsedArgs['flags']): MaterialValue {
  const value: MaterialValue = {}
  const text = readStringFlag(flags.text)
  const url = readStringFlag(flags.url)
  const localPath = readStringFlag(flags['local-path'])
  const submitId = readStringFlag(flags['submit-id'])
  const provider = readStringFlag(flags.provider)
  const fileName = readStringFlag(flags['file-name'])
  const mimeType = readStringFlag(flags['mime-type'])
  const duration = readNumberFlag(flags.duration)

  if (text !== undefined) value.text = text
  if (url !== undefined) value.url = url
  if (localPath !== undefined) value.localPath = localPath
  if (submitId !== undefined) value.submitId = submitId
  if (provider !== undefined) value.provider = provider
  if (fileName !== undefined) value.fileName = fileName
  if (mimeType !== undefined) value.mimeType = mimeType
  if (duration !== undefined) value.duration = duration

  if (!Object.keys(value).length) throw new Error('value is empty; pass --text, --url, or another value flag')
  return value
}

function readMessage(flags: ParsedArgs['flags']): MaterialMessage {
  const role = readStringFlag(flags.role) ?? 'assistant'
  if (role !== 'user' && role !== 'assistant') throw new Error(`invalid role: ${role}`)
  return createMessage(role, required(readStringFlag(flags.text), 'text'))
}

function createMessage(role: MaterialMessage['role'], text: string): MaterialMessage {
  return {
    id: `msg-${Date.now()}-${Math.round(Math.random() * 10000)}`,
    role,
    text,
    createdAt: Date.now(),
  }
}

function parseArgs(args: string[]): ParsedArgs {
  const positionals: string[] = []
  const flags: ParsedArgs['flags'] = {}

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]
    if (arg === '--') continue
    if (!arg.startsWith('--')) {
      positionals.push(arg)
      continue
    }

    const [rawKey, inlineValue] = arg.slice(2).split('=', 2)
    const next = args[index + 1]
    if (inlineValue !== undefined) {
      flags[rawKey] = inlineValue
    } else if (next && !next.startsWith('--')) {
      flags[rawKey] = next
      index += 1
    } else {
      flags[rawKey] = true
    }
  }

  return { positionals, flags }
}

function readStringFlag(value: string | true | undefined) {
  if (value === undefined || value === true) return undefined
  return value
}

function readNumberFlag(value: string | true | undefined) {
  const raw = readStringFlag(value)
  if (raw === undefined) return undefined
  const number = Number(raw)
  if (!Number.isFinite(number)) throw new Error(`invalid number: ${raw}`)
  return number
}

function required<T>(value: T | undefined, name: string): T {
  if (value === undefined || value === '') throw new Error(`${name} is required`)
  return value
}

function printJson(value: unknown) {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`)
}

function printHelp() {
  printJson({
    ok: true,
    description: 'red-video-flow workflow CLI. Output is JSON for agent-safe parsing.',
    globalFlags: {
      '--base-url': 'Local server URL. Defaults to RED_VIDEO_FLOW_BASE_URL or http://127.0.0.1:5176.',
      '--base-revision': 'Optional optimistic concurrency revision for write commands.',
    },
    recommended: [
      {
        command: 'rvf workflow node run <workflowId> <nodeId> --prompt "..." --agent-id <agentId>',
        purpose: 'Run a text node end-to-end. The CLI handles start, heartbeat, agent call, complete, and fail.',
      },
      {
        command: 'rvf workflow node run <workflowId> <nodeId> --prompt "..." --model-id dreamina',
        purpose: 'Run an image/video node end-to-end through a visual model.',
      },
    ],
    readCommands: [
      'rvf workflow list',
      'rvf workflow get <workflowId>',
      'rvf workflow upstream <workflowId> <nodeId>',
      'rvf workflow node get <workflowId> <nodeId>',
    ],
    patchCommands: [
      'rvf workflow node set-status <workflowId> <nodeId> <empty|ready|running|done|error>',
      'rvf workflow node set-value <workflowId> <nodeId> --text "..."',
      'rvf workflow node set-value <workflowId> <nodeId> --url "..." --local-path "..." --file-name "..." --mime-type "image/png"',
      'rvf workflow node append-message <workflowId> <nodeId> --role assistant --text "..."',
    ],
    advancedRunPrimitives: [
      'rvf workflow node start <workflowId> <nodeId> --prompt "..."',
      'rvf workflow node heartbeat <workflowId> <nodeId> --run-id <runId>',
      'rvf workflow node complete <workflowId> <nodeId> --run-id <runId> --text "..." --message "..."',
      'rvf workflow node complete <workflowId> <nodeId> --run-id <runId> --url "..." --local-path "..." --file-name "..." --mime-type "image/png" --message "..."',
      'rvf workflow node fail <workflowId> <nodeId> --run-id <runId> --message "..."',
    ],
    guidance: [
      'Prefer workflow node run for normal agent work.',
      'Use start/heartbeat/complete/fail only for custom external executors.',
      'Never overwrite full workflow JSON for routine node updates.',
    ],
  })
}
