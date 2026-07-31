import {
  collectWorkflowInputSchema,
  createExecutionPlan,
  type AssetReference,
  type MaterialNode,
  type MaterialValue,
  type NodeResult,
  type UpstreamResultReference,
  type WorkflowDocument,
  type WorkflowExecutionPlan,
  type WorkflowInputValueType,
} from '@red-video-flow/workflow-core'
import type { DurableRuntime } from './runtime.js'
import { createNodeRun, toNodeRun } from './runService.js'

export type AppRunStatus = 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled'

export type CoworkAppRun = {
  id: string
  userId: string
  workflowId: string
  revision: number
  status: AppRunStatus
  inputs: Record<string, unknown>
  graphSnapshot: WorkflowDocument
  executionPlan: WorkflowExecutionPlan
  nodeStates: Record<string, {
    status: 'pending' | 'running' | 'succeeded' | 'failed' | 'cancelled' | 'skipped'
    resultIds: string[]
    startedAt?: number
    finishedAt?: number
    error?: string
  }>
  outputs?: Record<string, MaterialValue>
  error?: string
  events: Array<{
    id: number
    type: string
    nodeId?: string
    message?: string
    createdAt: number
  }>
  createdAt: number
  updatedAt: number
  cancelled: boolean
}

export async function executeWorkflowRun(runtime: DurableRuntime, runId: string) {
  const run = await runtime.infrastructure.postgresWorkflowAppRuns.get<CoworkAppRun>(runId)
  if (!run || !['queued', 'running'].includes(run.status)) return
  const workflow = run.graphSnapshot
  const values = new Map(workflow.graph.nodes.map((node) => [node.id, { ...node.data.value }]))
  const resultsByNode = new Map<string, NodeResult[]>()
  try {
    applyInputs(workflow, run.inputs, values)
    run.status = 'running'
    await addEvent(runtime, run, 'started', undefined, 'Workflow 开始运行')
    for (const level of run.executionPlan.levels) {
      for (const nodeId of level) {
        if (run.cancelled) throw new CancelledError()
        const node = workflow.graph.nodes.find((item) => item.id === nodeId)
        if (!node || isInputNode(node)) continue
        run.nodeStates[node.id] = {
          ...run.nodeStates[node.id],
          status: 'running',
          startedAt: Date.now(),
        }
        await addEvent(runtime, run, 'node_started', node.id, `开始执行 ${node.data.title}`)
        const upstream = workflow.graph.edges
          .filter((edge) => edge.target === node.id)
          .map((edge) => workflow.graph.nodes.find((item) => item.id === edge.source)!)
          .filter(Boolean)
        try {
          if (node.data.composer) {
            const upstreamResults = collectReferences(run.id, node, upstream, workflow, values, resultsByNode)
            await persistComposerContext(runtime, workflow.id, node.id, upstreamResults)
            const nodeRun = await createNodeRun(runtime, {
              userId: run.userId,
              workflowId: workflow.id,
              nodeId: node.id,
              input: {
                prompt: node.data.composer.prompt,
                attachments: node.data.composer.attachments,
                upstreamResults,
                model: node.data.composer.model,
                generationConfig: node.data.composer.generationConfig,
              },
            })
            await runtime.infrastructure.jobs.enqueue({
              id: `execute-node:${nodeRun.id}`,
              type: 'execute-node',
              payload: { runId: nodeRun.id },
              maxAttempts: 1,
            })
            const completed = await waitForNode(runtime, nodeRun.id, run)
            if (completed.status !== 'succeeded') {
              throw new Error(completed.error?.message ?? `${node.data.title} 执行失败`)
            }
            const stored = await runtime.infrastructure.workflowRuns.get(nodeRun.id)
            const results = Array.isArray(stored?.result) ? stored.result as NodeResult[] : []
            resultsByNode.set(node.id, results)
            values.set(
              node.id,
              valueFromResult(results[results.length - 1]) ?? {},
            )
            run.nodeStates[node.id] = {
              status: 'succeeded',
              resultIds: completed.resultIds,
              startedAt: run.nodeStates[node.id].startedAt,
              finishedAt: Date.now(),
            }
          } else {
            values.set(node.id, passThroughValue(node, upstream, values))
            run.nodeStates[node.id] = {
              status: 'succeeded',
              resultIds: [],
              startedAt: run.nodeStates[node.id].startedAt,
              finishedAt: Date.now(),
            }
          }
          await addEvent(runtime, run, 'node_completed', node.id, `完成 ${node.data.title}`)
        } catch (error) {
          run.nodeStates[node.id] = {
            ...run.nodeStates[node.id],
            status: 'failed',
            resultIds: [],
            finishedAt: Date.now(),
            error: error instanceof Error ? error.message : String(error),
          }
          throw error
        }
      }
    }
    run.outputs = Object.fromEntries(outputNodes(workflow).map((node) => [
      node.data.serviceLabel?.trim() || node.id,
      values.get(node.id) ?? {},
    ]))
    run.status = 'succeeded'
    await addEvent(runtime, run, 'completed', undefined, 'Workflow 运行完成')
  } catch (error) {
    if (error instanceof CancelledError || run.cancelled) {
      run.status = 'cancelled'
      markRemaining(run, 'cancelled')
      await addEvent(runtime, run, 'cancelled', undefined, '运行已取消')
    } else {
      run.status = 'failed'
      run.error = error instanceof Error ? error.message : String(error)
      markRemaining(run, 'skipped')
      await addEvent(runtime, run, 'failed', undefined, run.error)
    }
  }
}

export function createAppRun(
  workflow: WorkflowDocument,
  userId: string,
  inputs: Record<string, unknown>,
): CoworkAppRun {
  const now = Date.now()
  const snapshot = structuredClone(workflow)
  return {
    id: `app-run-${now}-${Math.round(Math.random() * 1_000_000)}`,
    userId,
    workflowId: workflow.id,
    revision: workflow.revision,
    status: 'queued',
    inputs,
    graphSnapshot: snapshot,
    executionPlan: createExecutionPlan(snapshot.graph),
    nodeStates: Object.fromEntries(snapshot.graph.nodes.map((node) => [
      node.id,
      {
        status: isInputNode(node) ? 'succeeded' : 'pending',
        resultIds: [],
        ...(isInputNode(node) ? { startedAt: now, finishedAt: now } : {}),
      },
    ])),
    events: [],
    createdAt: now,
    updatedAt: now,
    cancelled: false,
  }
}

async function addEvent(
  runtime: DurableRuntime,
  run: CoworkAppRun,
  type: string,
  nodeId?: string,
  message?: string,
) {
  const now = Date.now()
  run.events.push({ id: run.events.length + 1, type, nodeId, message, createdAt: now })
  run.updatedAt = now
  await runtime.infrastructure.postgresWorkflowAppRuns.save(run)
}

async function waitForNode(runtime: DurableRuntime, runId: string, appRun: CoworkAppRun) {
  while (true) {
    if (appRun.cancelled) throw new CancelledError()
    const stored = await runtime.infrastructure.workflowRuns.get(runId)
    if (!stored) throw new Error(`node run not found: ${runId}`)
    const run = toNodeRun(stored)
    if (!['queued', 'running'].includes(run.status)) return run
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
}

async function persistComposerContext(
  runtime: DurableRuntime,
  workflowId: string,
  nodeId: string,
  upstreamResults: UpstreamResultReference[],
) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const workflow = await runtime.infrastructure.postgresWorkflows.get(workflowId)
    const node = workflow?.graph.nodes.find((item) => item.id === nodeId)
    if (!workflow || !node?.data.composer) return
    try {
      await runtime.infrastructure.postgresWorkflows.patch({
        id: workflowId,
        baseRevision: workflow.revision,
        ops: [{
          type: 'setNodeComposer',
          nodeId,
          composer: { ...node.data.composer, upstreamResults, updatedAt: Date.now() },
        }],
      })
      return
    } catch {
      if (attempt === 2) throw new Error(`unable to persist composer context: ${nodeId}`)
    }
  }
}

function collectReferences(
  appRunId: string,
  node: MaterialNode,
  upstream: MaterialNode[],
  workflow: WorkflowDocument,
  values: Map<string, MaterialValue>,
  resultsByNode: Map<string, NodeResult[]>,
) {
  const references: UpstreamResultReference[] = []
  for (const source of upstream) {
    const edge = workflow.graph.edges.find((item) => item.source === source.id && item.target === node.id)!
    const results = resultsByNode.get(source.id) ?? []
    if (results.length) {
      for (const result of results) {
        references.push({
          edgeId: edge.id ?? `${edge.source}-${edge.target}`,
          nodeId: source.id,
          resultId: result.id,
          resultType: result.type,
          assets: resultAssets(result),
          text: result.type === 'text' ? result.text : undefined,
        })
      }
    } else {
      const value = values.get(source.id) ?? source.data.value
      references.push({
        edgeId: edge.id ?? `${edge.source}-${edge.target}`,
        nodeId: source.id,
        resultId: `${appRunId}:${source.id}`,
        resultType: source.data.materialType,
        assets: materialAssets(appRunId, source, value),
        text: value.text,
      })
    }
  }
  return references
}

function applyInputs(
  workflow: WorkflowDocument,
  inputs: Record<string, unknown>,
  values: Map<string, MaterialValue>,
) {
  for (const field of Object.values(collectWorkflowInputSchema(workflow))) {
    const raw = field.key in inputs ? inputs[field.key] : field.defaultValue
    if (raw === undefined && field.required) throw new Error(`missing required input: ${field.key}`)
    if (raw !== undefined) values.set(field.nodeId, inputValue(field.valueType, raw))
  }
}

function inputValue(type: WorkflowInputValueType, input: unknown): MaterialValue {
  if (type === 'text' || type === 'number' || type === 'boolean') return { text: String(input) }
  const record = Array.isArray(input) ? input[0] : input
  if (!record || typeof record !== 'object') throw new Error(`${type} input must be an uploaded asset`)
  const asset = record as Record<string, unknown>
  const url = typeof asset.url === 'string' ? asset.url : undefined
  if (!url) throw new Error(`${type} input has no url`)
  return {
    url,
    fileName: typeof asset.fileName === 'string' ? asset.fileName : undefined,
    mimeType: typeof asset.mimeType === 'string' ? asset.mimeType : undefined,
  }
}

function passThroughValue(
  node: MaterialNode,
  upstream: MaterialNode[],
  values: Map<string, MaterialValue>,
) {
  if (hasValue(values.get(node.id))) return values.get(node.id)!
  const source = upstream.map((item) => values.get(item.id)).find(hasValue)
  return source ?? { text: node.data.title }
}

function resultAssets(result: NodeResult): AssetReference[] {
  if (result.type === 'image') return result.images
  if (result.type === 'video') return [result.video, ...(result.lastFrame ? [result.lastFrame] : [])]
  return []
}

function materialAssets(appRunId: string, node: MaterialNode, value: MaterialValue) {
  if (node.data.materialType === 'text' || !value.url) return []
  return [{
    id: `${appRunId}:${node.id}:asset`,
    kind: node.data.materialType,
    url: value.url,
    name: value.fileName,
    mimeType: value.mimeType,
  }] as AssetReference[]
}

function valueFromResult(result: NodeResult | undefined): MaterialValue | undefined {
  if (!result) return undefined
  if (result.type === 'text') return { text: result.text }
  const asset = result.type === 'image' ? result.images[0] : result.video
  return asset ? { url: asset.url, fileName: asset.name, mimeType: asset.mimeType } : undefined
}

function outputNodes(workflow: WorkflowDocument) {
  const explicit = workflow.graph.nodes.filter((node) => node.data.serviceRole === 'output')
  if (explicit.length) return explicit
  const sources = new Set(workflow.graph.edges.map((edge) => edge.source))
  return workflow.graph.nodes.filter((node) => !sources.has(node.id))
}

function isInputNode(node: MaterialNode) {
  return node.data.executionMode === 'input'
    || node.data.serviceRole === 'input'
    || Boolean(node.data.workflowInput)
}

function hasValue(value: MaterialValue | undefined): value is MaterialValue {
  return Boolean(value?.text || value?.url)
}

function markRemaining(run: CoworkAppRun, status: 'cancelled' | 'skipped') {
  const now = Date.now()
  for (const state of Object.values(run.nodeStates)) {
    if (state.status === 'pending') {
      state.status = status
      state.finishedAt = now
    }
  }
}

class CancelledError extends Error {}
