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
  queryVisualTask,
  runNodeWithAgent,
  runVisualNode,
  startWorkflowNodeRun,
  type VisualRunResult,
} from '@red-video-flow/workflow-client'
import {
  createGeneratedValue,
  createMaterialNode,
  getUpstreamNodes,
  materialTypes,
  type MaterialMessage,
  type MaterialNode,
  type MaterialType,
  type MaterialValue,
  type NodeSize,
  type NodeStatus,
  type WorkflowDocument,
  type WorkflowPatchOperation,
} from '@red-video-flow/workflow-core'

type CliOptions = {
  baseUrl: string
  baseRevision?: number
}

type ParsedArgs = {
  positionals: string[]
  flags: Record<string, string | true>
}

const statuses = new Set<NodeStatus>(['empty', 'ready', 'running', 'done', 'error'])
const materialTypeSet = new Set<MaterialType>(materialTypes)
const defaultNodeSizes: Record<MaterialType, NodeSize> = {
  text: { width: 360, height: 220 },
  image: { width: 560, height: 280 },
  video: { width: 560, height: 280 },
}
const materialTypeLabels: Record<MaterialType, string> = {
  text: '文本节点',
  image: '图片节点',
  video: '视频节点',
}
const defaultPollIntervalMs = 5_000
const defaultVisualTimeoutMs = 10 * 60_000

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

  if (scope === 'visual') {
    await runVisualCommand(command, args, parsed.flags)
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

  if (command === 'recover') {
    await recoverVisualNodes(args[0], parsed.flags, options)
    return
  }
  if (command === 'node') {
    await runNodeCommand(args, parsed.flags, options)
    return
  }
  if (command === 'edge') {
    await runEdgeCommand(args, parsed.flags, options)
    return
  }
  throw new Error(`unknown workflow command: ${command}`)
}

async function runNodeCommand(args: string[], flags: ParsedArgs['flags'], options: CliOptions) {
  const command = required(args[0], 'node command')
  const workflowId = required(args[1], 'workflowId')

  if (command === 'add') {
    const materialType = required(args[2] ?? readStringFlag(flags.type), 'materialType') as MaterialType
    if (!materialTypeSet.has(materialType)) throw new Error(`invalid material type: ${materialType}`)

    const nodeId = readStringFlag(flags['node-id']) ?? createCliId(materialType)
    const value = readOptionalValue(flags)
    const requestedStatus = readStringFlag(flags.status) as NodeStatus | undefined
    if (requestedStatus && !statuses.has(requestedStatus)) throw new Error(`invalid status: ${requestedStatus}`)
    const size = defaultNodeSizes[materialType]
    const node = createMaterialNode({
      id: nodeId,
      materialType,
      position: {
        x: readNumberFlag(flags.x) ?? 0,
        y: readNumberFlag(flags.y) ?? 0,
      },
      title: readStringFlag(flags.title) ?? createCliNodeTitle(materialType),
      size: {
        width: readNumberFlag(flags.width) ?? size.width,
        height: readNumberFlag(flags.height) ?? size.height,
      },
    })
    if (value) {
      node.data.value = value
      node.data.status = requestedStatus ?? 'ready'
    } else if (requestedStatus) {
      node.data.status = requestedStatus
    }

    await commitPatch(workflowId, [{ type: 'addNode', node }], options, { node })
    return
  }

  const nodeId = required(args[2], 'nodeId')

  if (command === 'remove') {
    await commitPatch(workflowId, [{ type: 'removeNode', nodeId }], options, { removedNodeId: nodeId })
    return
  }

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

async function runEdgeCommand(args: string[], flags: ParsedArgs['flags'], options: CliOptions) {
  const command = required(args[0], 'edge command')
  const workflowId = required(args[1], 'workflowId')

  if (command === 'add') {
    const source = required(args[2] ?? readStringFlag(flags.source), 'sourceNodeId')
    const target = required(args[3] ?? readStringFlag(flags.target), 'targetNodeId')
    const edge = {
      id: readStringFlag(flags['edge-id']) ?? createCliId('edge'),
      source,
      target,
    }
    const workflow = await fetchWorkflow(workflowId)
    if (workflow.graph.edges.some((item) => item.source === source && item.target === target)) {
      throw new Error(`edge already exists: ${source} -> ${target}`)
    }
    await commitPatch(workflowId, [{ type: 'addEdge', edge }], options, { edge })
    return
  }

  if (command === 'remove') {
    const edgeId = args[2] ?? readStringFlag(flags['edge-id'])
    const source = readStringFlag(flags.source)
    const target = readStringFlag(flags.target)
    if (!edgeId && !(source && target)) {
      throw new Error('edgeId or both --source and --target are required')
    }
    const op: Extract<WorkflowPatchOperation, { type: 'removeEdge' }> = {
      type: 'removeEdge',
      edgeId,
      source,
      target,
    }
    await commitPatch(workflowId, [op], options, {
      removedEdge: edgeId ? { id: edgeId } : { source, target },
    })
    return
  }

  throw new Error(`unknown edge command: ${command}`)
}

async function runVisualCommand(command: string | undefined, args: string[], flags: ParsedArgs['flags']) {
  if (command !== 'query') throw new Error(`unknown visual command: ${command ?? ''}`)
  const submitId = required(args[0] ?? readStringFlag(flags['submit-id']), 'submitId')
  const nodeKind = readMaterialTypeFlag(flags['node-kind'])
  const wait = readBooleanFlag(flags.wait, false)
  const outcome = await pollVisualTask({
    submitId,
    nodeKind,
    wait,
    pollIntervalMs: readPollInterval(flags),
    timeoutMs: readTimeout(flags),
  })
  printJson({
    ok: true,
    submitId,
    attempts: outcome.attempts,
    timedOut: outcome.timedOut,
    terminal: !isPendingVisualTask(outcome.result),
    result: outcome.result,
  })
}

type VisualPollOutcome = {
  result: VisualRunResult
  attempts: number
  timedOut: boolean
}

type VisualRecoveryQuery = {
  workflowId: string
  nodeId: string
  nodeKind: MaterialType
  submitId: string
  outcome?: VisualPollOutcome
  error?: string
}

async function pollVisualTask(input: {
  submitId: string
  nodeKind?: MaterialType
  wait: boolean
  pollIntervalMs: number
  timeoutMs: number
}): Promise<VisualPollOutcome> {
  const startedAt = Date.now()
  let attempts = 0

  while (true) {
    attempts += 1
    const result = await queryVisualTask({ submitId: input.submitId, nodeKind: input.nodeKind })
    if (!isPendingVisualTask(result) || !input.wait) {
      return { result, attempts, timedOut: false }
    }

    const elapsed = Date.now() - startedAt
    if (elapsed >= input.timeoutMs) {
      return { result, attempts, timedOut: true }
    }
    await delay(Math.min(input.pollIntervalMs, input.timeoutMs - elapsed))
  }
}

function isPendingVisualTask(result: VisualRunResult) {
  if (result.url || result.taskStatus === 'success' || result.taskStatus === 'failed') return false
  return result.taskStatus === 'querying' || result.taskStatus === 'unknown' || result.taskStatus === undefined
}

async function recoverVisualNodes(workflowId: string | undefined, flags: ParsedArgs['flags'], options: CliOptions) {
  const workflows = workflowId
    ? [await fetchWorkflow(workflowId)]
    : (await fetchWorkflows()).workflows
  const candidates = workflows.flatMap((workflow) =>
    workflow.graph.nodes
      .filter((node) =>
        (node.data.materialType === 'image' || node.data.materialType === 'video')
        && node.data.status === 'running'
        && node.data.value.submitId
        && (!node.data.value.provider || node.data.value.provider === 'dreamina'),
      )
      .map((node) => ({
        workflowId: workflow.id,
        nodeId: node.id,
        nodeKind: node.data.materialType,
        submitId: node.data.value.submitId as string,
      })),
  )

  if (!candidates.length) {
    printJson({ ok: true, recoveredCount: 0, pendingCount: 0, results: [] })
    return
  }

  const wait = !readBooleanFlag(flags.once, false)
  const pollIntervalMs = readPollInterval(flags)
  const timeoutMs = readTimeout(flags)
  const queried: VisualRecoveryQuery[] = await Promise.all(
    candidates.map(async (candidate) => {
      try {
        return {
          ...candidate,
          outcome: await pollVisualTask({
            submitId: candidate.submitId,
            nodeKind: candidate.nodeKind,
            wait,
            pollIntervalMs,
            timeoutMs,
          }),
        }
      } catch (error) {
        return {
          ...candidate,
          error: error instanceof Error ? error.message : String(error),
        }
      }
    }),
  )

  const updates: Array<{ workflowId: string; nodeId: string; status: NodeStatus }> = []
  for (const workflow of workflows) {
    const terminal = queried.filter(
      (item) => item.workflowId === workflow.id && item.outcome && !isPendingVisualTask(item.outcome.result),
    )
    if (!terminal.length) continue

    const latest = await fetchWorkflow(workflow.id)
    const ops: WorkflowPatchOperation[] = []
    for (const item of terminal) {
      const node = latest.graph.nodes.find((candidate) => candidate.id === item.nodeId)
      if (!node || node.data.status !== 'running' || node.data.value.submitId !== item.submitId) continue

      const result = item.outcome!.result
      const succeeded = result.taskStatus === 'success' && Boolean(result.url)
      const status: NodeStatus = succeeded ? 'done' : 'error'
      const message = succeeded
        ? `视觉任务 ${item.submitId} 已恢复并完成。`
        : result.failReason || (result.taskStatus === 'success'
          ? `视觉任务 ${item.submitId} 已成功，但没有返回可用媒体。`
          : `视觉任务 ${item.submitId} 失败${result.genStatus ? `：${result.genStatus}` : ''}。`)
      const value: MaterialValue = succeeded
        ? {
            ...node.data.value,
            text: undefined,
            url: result.url,
            localPath: result.localPath,
            fileName: result.fileName,
            mimeType: result.mimeType,
          }
        : {
            ...node.data.value,
            text: message,
          }

      ops.push(
        { type: 'setNodeStatus', nodeId: node.id, status },
        { type: 'setNodeValue', nodeId: node.id, value },
        { type: 'appendNodeMessage', nodeId: node.id, message: createMessage('assistant', message) },
      )
      updates.push({ workflowId: workflow.id, nodeId: node.id, status })
    }
    if (ops.length) {
      await patchWorkflow(workflow.id, {
        baseRevision: options.baseRevision ?? latest.revision,
        ops,
      })
    }
  }

  const results = queried.map((item) => ({
    workflowId: item.workflowId,
    nodeId: item.nodeId,
    submitId: item.submitId,
    attempts: item.outcome?.attempts ?? 0,
    timedOut: item.outcome?.timedOut ?? false,
    taskStatus: item.outcome?.result.taskStatus,
    genStatus: item.outcome?.result.genStatus,
    error: item.error,
    recovered: updates.some((update) => update.workflowId === item.workflowId && update.nodeId === item.nodeId),
  }))
  const pendingCount = results.filter((item) =>
    !item.recovered && (item.error || item.taskStatus === 'querying' || item.taskStatus === 'unknown'),
  ).length
  printJson({
    ok: true,
    recoveredCount: updates.length,
    pendingCount,
    results,
  })
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
    let result = await runVisualNode({
      node,
      upstream,
      edges: workflow.graph.edges,
      prompt,
      modelId: readStringFlag(flags['model-id']),
    })
    if (!result.url && result.submitId && !readBooleanFlag(flags['no-wait'], false) && isPendingVisualTask(result)) {
      const outcome = await pollVisualTask({
        submitId: result.submitId,
        nodeKind: node.data.materialType,
        wait: true,
        pollIntervalMs: readPollInterval(flags),
        timeoutMs: readTimeout(flags),
      })
      result = outcome.result
    }
    if (result.taskStatus === 'failed') {
      throw new Error(result.failReason || `视觉任务失败${result.genStatus ? `：${result.genStatus}` : ''}`)
    }
    if (result.taskStatus === 'success' && !result.url) {
      throw new Error('视觉任务已成功，但没有返回可用媒体')
    }
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

async function commitPatch(
  workflowId: string,
  ops: WorkflowPatchOperation[],
  options: CliOptions,
  details: Record<string, unknown> = {},
) {
  const baseRevision = options.baseRevision ?? (await fetchWorkflow(workflowId)).revision
  const result = await patchWorkflow(workflowId, { baseRevision, ops })
  printJson({
    ok: true,
    ...details,
    workflow: result.workflow,
    revision: result.workflow.revision,
    appliedOps: result.appliedOps,
  })
}

function readValue(flags: ParsedArgs['flags']): MaterialValue {
  const value = readOptionalValue(flags)
  if (!value) throw new Error('value is empty; pass --text, --url, or another value flag')
  return value
}

function readOptionalValue(flags: ParsedArgs['flags']): MaterialValue | undefined {
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

  return Object.keys(value).length ? value : undefined
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

function readBooleanFlag(value: string | true | undefined, fallback: boolean) {
  if (value === undefined) return fallback
  if (value === true) return true
  if (['true', '1', 'yes', 'on'].includes(value.toLowerCase())) return true
  if (['false', '0', 'no', 'off'].includes(value.toLowerCase())) return false
  throw new Error(`invalid boolean: ${value}`)
}

function readMaterialTypeFlag(value: string | true | undefined) {
  const materialType = readStringFlag(value) as MaterialType | undefined
  if (materialType && !materialTypeSet.has(materialType)) throw new Error(`invalid material type: ${materialType}`)
  return materialType
}

function readPollInterval(flags: ParsedArgs['flags']) {
  const value = readNumberFlag(flags['poll-interval-ms']) ?? defaultPollIntervalMs
  if (value <= 0) throw new Error('poll-interval-ms must be greater than 0')
  return value
}

function readTimeout(flags: ParsedArgs['flags']) {
  const value = readNumberFlag(flags['timeout-ms']) ?? defaultVisualTimeoutMs
  if (value < 0) throw new Error('timeout-ms must be greater than or equal to 0')
  return value
}

function required<T>(value: T | undefined, name: string): T {
  if (value === undefined || value === '') throw new Error(`${name} is required`)
  return value
}

function printJson(value: unknown) {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`)
}

function delay(milliseconds: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, milliseconds))
}

function createCliId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.round(Math.random() * 10000)}`
}

function createCliNodeTitle(materialType: MaterialType) {
  return `${materialTypeLabels[materialType]} ${Math.floor(Math.random() * 90) + 10}`
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
        purpose: 'Run an image/video node and keep polling asynchronous visual tasks until a terminal status or timeout.',
      },
      {
        command: 'rvf workflow recover [workflowId]',
        purpose: 'Find saved running visual nodes with submitId values and recover them automatically.',
      },
    ],
    readCommands: [
      'rvf workflow list',
      'rvf workflow get <workflowId>',
      'rvf workflow upstream <workflowId> <nodeId>',
      'rvf workflow node get <workflowId> <nodeId>',
      'rvf visual query <submitId> [--node-kind image|video] [--wait]',
    ],
    graphCommands: [
      'rvf workflow node add <workflowId> <text|image|video> [--node-id <id>] [--title "..."] [--x 0 --y 0]',
      'rvf workflow node remove <workflowId> <nodeId>',
      'rvf workflow edge add <workflowId> <sourceNodeId> <targetNodeId> [--edge-id <id>]',
      'rvf workflow edge remove <workflowId> <edgeId>',
      'rvf workflow edge remove <workflowId> --source <sourceNodeId> --target <targetNodeId>',
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
    visualRecovery: {
      queryOnce: 'rvf visual query <submitId>',
      queryUntilTerminal: 'rvf visual query <submitId> --wait [--poll-interval-ms 5000] [--timeout-ms 600000]',
      recoverSavedNodes: 'rvf workflow recover [workflowId] [--poll-interval-ms 5000] [--timeout-ms 600000]',
      recoverOnce: 'rvf workflow recover [workflowId] --once',
      disableRunWaiting: 'Add --no-wait to workflow node run to keep the previous submit-only behavior.',
    },
    guidance: [
      'Prefer workflow node run for normal agent work.',
      'Use start/heartbeat/complete/fail only for custom external executors.',
      'Never overwrite full workflow JSON for routine node updates.',
    ],
  })
}
