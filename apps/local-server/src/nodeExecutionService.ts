import { readFile } from 'node:fs/promises'
import { extname, join } from 'node:path'
import { randomUUID } from 'node:crypto'
import type {
  AssetReference,
  ImageNodeResult,
  NodeResult,
  NodeRunInput,
  NodeRunTrace,
  TextNodeResult,
  VideoNodeResult,
} from '@red-video-flow/workflow-core'
import {
  buildOpenAITextRequest,
} from '@red-video-flow/workflow-runtime'
import type { LocalServerRuntime } from './runtime.js'

export type WorkflowNodeRunEvent =
  | { type: 'run'; status: 'queued' | 'running'; runId: string; workflowRevision?: number; providerTask?: { providerId: string; taskId?: string; responseId?: string } }
  | { type: 'text_delta'; runId: string; delta: string }
  | { type: 'image_partial'; runId: string; index: number; base64: string }
  | { type: 'result'; runId: string; result: NodeResult }
  | { type: 'done'; runId: string; resultIds: string[]; workflowRevision?: number }
  | { type: 'error'; runId: string; code?: string; message: string; retryable: boolean; workflowRevision?: number }

type ExecuteInput = {
  runId: string
  workflowId: string
  nodeId: string
  input: NodeRunInput
  signal: AbortSignal
  emit: (event: WorkflowNodeRunEvent) => void
}

export async function executeWorkflowNodeRun(
  runtime: LocalServerRuntime,
  execution: ExecuteInput,
) {
  execution.emit({ type: 'run', status: 'queued', runId: execution.runId })
  const runningRevision = persistNodeStatus(runtime, execution, 'running')
  execution.emit({
    type: 'run',
    status: 'running',
    runId: execution.runId,
    workflowRevision: runningRevision,
  })
  updateTrace(runtime, execution, {
    runId: execution.runId,
    nodeId: execution.nodeId,
    providerId: execution.input.model.providerId,
    modelId: execution.input.model.modelId,
    composer: sanitizeTraceValue(execution.input) as NodeRunInput,
    startedAt: Date.now(),
  })

  try {
    const configType = execution.input.generationConfig.type
    let results: NodeResult[]
    if (configType === 'openai-text') {
      results = [await executeText(runtime, execution)]
    } else if (configType === 'openai-image') {
      results = [await executeImage(runtime, execution)]
    } else if (configType === 'volc-video') {
      results = [await executeVideo(runtime, execution)]
    } else {
      throw new ProviderExecutionError('unsupported_config', `Unsupported generation config: ${configType}`, false)
    }

    const workflowRevision = persistNodeResults(runtime, execution, results)
    for (const result of results) execution.emit({ type: 'result', runId: execution.runId, result })
    execution.emit({
      type: 'done',
      runId: execution.runId,
      resultIds: results.map((result) => result.id),
      workflowRevision,
    })
    finishTrace(runtime, execution, {})
  } catch (error) {
    const normalized = normalizeError(error)
    finishTrace(runtime, execution, { error: normalized.message })
    const workflowRevision = persistNodeStatus(runtime, execution, 'error')
    execution.emit({
      type: 'error',
      runId: execution.runId,
      code: normalized.code,
      message: normalized.message,
      retryable: normalized.retryable,
      workflowRevision,
    })
  }
}

export async function startDurableWorkflowNodeRun(
  runtime: LocalServerRuntime,
  runId: string,
  signal: AbortSignal = new AbortController().signal,
) {
  const run = runtime.backend.runs.getNodeRun(runId)
  if (!run) throw new Error(`node run not found: ${runId}`)
  const configType = run.inputSnapshot.generationConfig.type
  if (configType === 'openai-image' || configType === 'volc-video') {
    await runtime.backend.visualTasks.startNodeRun(runId)
    return
  }

  await executeWorkflowNodeRun(runtime, {
    runId,
    workflowId: run.workflowId,
    nodeId: run.nodeId,
    input: run.inputSnapshot,
    signal,
    emit: (event) => {
      if (event.type === 'run' && event.status === 'running') {
        runtime.backend.runs.markNodeRunRunning(runId)
        return
      }
      if (event.type === 'text_delta') {
        runtime.backend.runs.appendNodeRunEvent(runId, event.type, event)
        return
      }
      if (event.type === 'done') {
        const workflow = runtime.backend.workflows.get(run.workflowId)
        const node = workflow?.graph.nodes.find((item) => item.id === run.nodeId)
        const results = (node?.data.results ?? []).filter((result) => event.resultIds.includes(result.id))
        runtime.backend.runs.completeNodeRun(runId, results, event.workflowRevision)
        return
      }
      if (event.type === 'error') {
        runtime.backend.runs.failNodeRun(runId, {
          code: event.code,
          message: event.message,
          retryable: event.retryable,
        })
      }
    },
  })
}

function persistNodeStatus(
  runtime: LocalServerRuntime,
  execution: ExecuteInput,
  status: 'running' | 'error',
) {
  const workflows = runtime.backend.workflows
  if (!workflows?.get || !workflows?.patch) return undefined
  const current = workflows.get(execution.workflowId)
  if (!current) return undefined
  return workflows.patch({
    id: execution.workflowId,
    baseRevision: current.revision,
    ops: [
      { type: 'setNodeLatestRun', nodeId: execution.nodeId, runId: execution.runId },
      { type: 'setNodeStatus', nodeId: execution.nodeId, status },
    ],
  }).revision
}

function persistNodeResults(
  runtime: LocalServerRuntime,
  execution: ExecuteInput,
  results: NodeResult[],
) {
  const workflows = runtime.backend.workflows
  if (!workflows?.get || !workflows?.patch) return undefined
  const current = workflows.get(execution.workflowId)
  if (!current) return undefined
  const saved = workflows.patch({
    id: execution.workflowId,
    baseRevision: current.revision,
    ops: [
      { type: 'setNodeLatestRun' as const, nodeId: execution.nodeId, runId: execution.runId },
      ...results.map((result) => ({
        type: 'appendNodeResult' as const,
        nodeId: execution.nodeId,
        result,
        makeCurrent: true,
      })),
      { type: 'setNodeStatus' as const, nodeId: execution.nodeId, status: 'done' as const },
    ],
  })
  return saved.revision
}

async function executeText(
  runtime: LocalServerRuntime,
  execution: ExecuteInput,
): Promise<TextNodeResult> {
  const request = buildOpenAITextRequest(await resolveLocalAssets(runtime, execution.input))
  const response = await providerFetch(
    `${runtime.config.textModelBaseUrl}/responses`,
    runtime.config.maasApiKey,
    request,
    execution.signal,
    (networkRequest) => appendNetworkRequest(runtime, execution, networkRequest),
  )

  let payload: unknown
  let streamedText = ''
  if (execution.input.generationConfig.type === 'openai-text' && execution.input.generationConfig.stream) {
    payload = await readOpenAIEventStream(response, (event) => {
      if (event.type === 'response.output_text.delta' && typeof event.delta === 'string') {
        streamedText += event.delta
        execution.emit({ type: 'text_delta', runId: execution.runId, delta: event.delta })
      }
    })
  } else {
    payload = await readProviderJson(response)
  }
  updateTrace(runtime, execution, { response: payload })

  const record = asRecord(payload)
  const text = streamedText || extractOutputText(record)
  if (!text) throw new ProviderExecutionError('empty_text_result', 'Text model returned no text', true)
  const resultId = randomUUID()
  const resource = runtime.backend.resources.createText({
    workspaceId: execution.workflowId,
    name: `文本结果 ${new Date().toLocaleString('zh-CN')}`,
    text,
    source: 'generated',
    sourceNodeId: execution.nodeId,
    sourceRunId: execution.runId,
    sourceResultId: resultId,
    providerId: execution.input.model.providerId,
    modelId: execution.input.model.modelId,
    prompt: resolveProviderPrompt(execution.input),
    generationConfig: execution.input.generationConfig as unknown as Record<string, unknown>,
  })
  runtime.backend.resources.bind({
    resourceId: resource.id,
    workflowId: execution.workflowId,
    nodeId: execution.nodeId,
    runId: execution.runId,
    resultId,
    relation: 'generated',
  })
  return {
    id: resultId,
    runId: execution.runId,
    type: 'text',
    text,
    resourceId: resource.id,
    provider: {
      providerId: execution.input.model.providerId,
      responseId: stringValue(record.id),
    },
    createdAt: Date.now(),
  }
}

async function executeImage(
  runtime: LocalServerRuntime,
  execution: ExecuteInput,
): Promise<ImageNodeResult> {
  const visualResult = await executePluginVisual(runtime, execution, 'image')
  const resultId = randomUUID()
  const assets = registerPluginAssets(runtime, execution, visualResult, 'image', resultId)
  if (!assets.length) {
    throw new ProviderExecutionError('empty_image_result', 'Image plugin returned no generated image', true)
  }
  const metadata = asRecord(visualResult.metadata)
  for (const asset of assets) {
    runtime.backend.resources.bind({
      resourceId: asset.id,
      workflowId: execution.workflowId,
      nodeId: execution.nodeId,
      runId: execution.runId,
      resultId,
      relation: 'generated',
    })
  }
  return {
    id: resultId,
    runId: execution.runId,
    type: 'image',
    images: assets.map(toAssetReference),
    provider: {
      providerId: execution.input.model.providerId,
      taskId: visualResult.submitId,
      responseId: stringValue(metadata.responseId),
      raw: metadata,
    },
    createdAt: Date.now(),
  }
}

async function executeVideo(
  runtime: LocalServerRuntime,
  execution: ExecuteInput,
): Promise<VideoNodeResult> {
  const visualResult = await executePluginVisual(runtime, execution, 'video')
  const resultId = randomUUID()
  const assets = registerPluginAssets(runtime, execution, visualResult, 'video', resultId)
  const video = assets.find((asset) => asset.kind === 'video')
  if (!video) {
    throw new ProviderExecutionError('empty_video_result', 'Video plugin returned no generated video', true)
  }
  const lastFrame = assets.find((asset) => asset.kind === 'image')
  runtime.backend.resources.bind({
    resourceId: video.id,
    workflowId: execution.workflowId,
    nodeId: execution.nodeId,
    runId: execution.runId,
    resultId,
    relation: 'generated',
  })
  if (lastFrame) {
    runtime.backend.resources.bind({
      resourceId: lastFrame.id,
      workflowId: execution.workflowId,
      nodeId: execution.nodeId,
      runId: execution.runId,
      resultId,
      relation: 'last-frame',
    })
  }
  return {
    id: resultId,
    runId: execution.runId,
    type: 'video',
    video: toAssetReference(video),
    lastFrame: lastFrame ? toAssetReference(lastFrame) : undefined,
    provider: {
      providerId: execution.input.model.providerId,
      taskId: visualResult.submitId,
    },
    createdAt: Date.now(),
  }
}

async function executePluginVisual(
  runtime: LocalServerRuntime,
  execution: ExecuteInput,
  nodeKind: 'image' | 'video',
) {
  const downloadDir = join(runtime.backend.assets.generatedDir, execution.runId)
  const upstream = await pluginUpstreamNodes(runtime, execution.input)
  const providerOptions = generationConfigOptions(execution.input)
  const request = {
    executionId: execution.runId,
    idempotencyKey: execution.runId,
    modelId: execution.input.model.modelId,
    nodeKind,
    prompt: execution.input.prompt,
    upstream,
    providerOptions,
    downloadDir,
  }
  updateTrace(runtime, execution, { providerInput: request })
  let result = await runtime.backend.visual.invoke({
    ...request,
    assetUrlForPath: (filePath) => runtime.backend.assets.assetUrlForPath(filePath),
    onEvent: (event) => {
      if (event.type === 'meta') {
        execution.emit({
          type: 'run',
          status: 'running',
          runId: execution.runId,
          providerTask: {
            providerId: execution.input.model.providerId,
            taskId: event.submitId,
          },
        })
      }
      if (event.type === 'partial-image') {
        execution.emit({
          type: 'image_partial',
          runId: execution.runId,
          index: event.index,
          base64: event.base64,
        })
      }
      if (event.type === 'network-request') {
        appendNetworkRequest(runtime, execution, event.request)
      }
    },
  })

  const submitId = result.submitId
  while (!result.url && submitId) {
    if (execution.signal.aborted) throw execution.signal.reason
    await abortableDelay(2_000, execution.signal)
    result = await runtime.backend.visual.query({
      executionId: `${execution.runId}-query`,
      providerId: execution.input.model.modelId,
      submitId,
      downloadDir,
      assetUrlForPath: (filePath) => runtime.backend.assets.assetUrlForPath(filePath),
    })
    if (result.taskStatus === 'failed') {
      throw new ProviderExecutionError(
        'visual_task_failed',
        result.failReason ?? 'Visual plugin task failed',
        true,
      )
    }
  }
  updateTrace(runtime, execution, { response: result })
  return { ...result, submitId: result.submitId ?? submitId }
}

function updateTrace(
  runtime: LocalServerRuntime,
  execution: ExecuteInput,
  patch: Record<string, unknown>,
) {
  const runs = runtime.backend.runs
  if (!runs) return
  const existing = runs.getNodeRun(execution.runId)?.trace
  if (!existing && !('runId' in patch)) return
  const sanitizedPatch = sanitizeTraceValue(patch) as Record<string, unknown>
  runs.updateNodeRunTrace(execution.runId, {
    ...(existing ?? patch),
    ...sanitizedPatch,
  } as NodeRunTrace)
}

function finishTrace(
  runtime: LocalServerRuntime,
  execution: ExecuteInput,
  patch: Record<string, unknown>,
) {
  const runs = runtime.backend.runs
  if (!runs) return
  const trace = runs.getNodeRun(execution.runId)?.trace
  if (!trace) return
  const finishedAt = Date.now()
  updateTrace(runtime, execution, {
    ...patch,
    finishedAt,
    durationMs: finishedAt - trace.startedAt,
  })
}

function appendNetworkRequest(
  runtime: LocalServerRuntime,
  execution: ExecuteInput,
  request: NonNullable<NodeRunTrace['networkRequests']>[number],
) {
  const trace = runtime.backend.runs?.getNodeRun(execution.runId)?.trace
  updateTrace(runtime, execution, {
    networkRequests: [...(trace?.networkRequests ?? []), request],
  })
}

const secretKeyPattern = /(authorization|api[-_]?key|token|secret|password|cookie)/i

function sanitizeTraceValue(value: unknown, key = ''): unknown {
  if (secretKeyPattern.test(key)) return '[REDACTED]'
  if (typeof value === 'string') {
    if (/^data:[^;]+;base64,/i.test(value)) {
      const mimeType = value.slice(5, value.indexOf(';'))
      return `[${mimeType} base64 omitted]`
    }
    return value
  }
  if (Array.isArray(value)) return value.map((item) => sanitizeTraceValue(item))
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([entryKey, entryValue]) => [
        entryKey,
        sanitizeTraceValue(entryValue, entryKey),
      ]),
    )
  }
  return value
}

async function pluginUpstreamNodes(
  runtime: LocalServerRuntime,
  input: NodeRunInput,
) {
  const assets = [
    ...input.attachments,
    ...input.upstreamResults.flatMap((result) => result.assets),
  ]
  return assets.map((asset, index) => {
    const localPath = asset.url.startsWith('/api/assets/')
      ? runtime.backend.assets.resolveAssetPath(asset.url)
      : undefined
    return {
      id: `input-${index}`,
      position: { x: 0, y: 0 },
      data: {
        materialType: asset.kind,
        title: asset.name ?? `Input ${index + 1}`,
        status: 'done',
        value: {
          localPath,
          url: /^https?:\/\//.test(asset.url) ? asset.url : undefined,
          fileName: asset.name,
          mimeType: asset.mimeType,
        },
        messages: [],
      },
    }
  })
}

function generationConfigOptions(input: NodeRunInput) {
  const {
    type: _type,
    version: _version,
    providerOptions,
    previousResponseId: _previousResponseId,
    ...options
  } = input.generationConfig as NodeRunInput['generationConfig'] & {
    previousResponseId?: string
  }
  return { ...options, ...providerOptions }
}

function resolveProviderPrompt(input: NodeRunInput) {
  const upstreamText = input.upstreamResults
    .map((result) => result.text?.trim())
    .filter((text): text is string => Boolean(text))
  return [...upstreamText, input.prompt.trim()].filter(Boolean).join('\n\n')
}

function registerPluginAssets(
  runtime: LocalServerRuntime,
  execution: ExecuteInput,
  result: {
    localPath?: string
    url?: string
    fileName?: string
    mimeType?: string
    assets?: Array<{
      url?: string
      localPath?: string
      fileName?: string
      mimeType?: string
      role?: 'output' | 'last_frame' | 'preview'
    }>
  },
  defaultKind: 'image' | 'video',
  resultId: string,
) {
  const sourceAssets: Array<{
    url?: string
    localPath?: string
    fileName?: string
    mimeType?: string
    role?: 'output' | 'last_frame' | 'preview'
  }> = result.assets?.length ? result.assets : [result]
  return sourceAssets.flatMap((asset, index) => {
    if (!asset.localPath || !asset.url) return []
    const kind = asset.role === 'last_frame'
      || asset.mimeType?.startsWith('image/')
      ? 'image'
      : asset.mimeType?.startsWith('video/')
        ? 'video'
        : defaultKind
    return [runtime.backend.assets.register({
      workflowId: execution.workflowId,
      kind,
      url: asset.url,
      localPath: asset.localPath,
      fileName: asset.fileName ?? `result-${index + 1}.${kind === 'image' ? 'png' : 'mp4'}`,
      mimeType: asset.mimeType,
      provider: execution.input.model.providerId,
      source: 'generated',
      sourceNodeId: execution.nodeId,
      sourceRunId: execution.runId,
      sourceResultId: resultId,
      modelId: execution.input.model.modelId,
      prompt: execution.input.prompt,
      generationConfig: execution.input.generationConfig as unknown as Record<string, unknown>,
    })]
  })
}

async function resolveLocalAssets(
  runtime: LocalServerRuntime,
  input: NodeRunInput,
): Promise<NodeRunInput> {
  const resolveAsset = async (asset: AssetReference): Promise<AssetReference> => {
    if (!asset.url.startsWith('/api/assets/')) return asset
    const filePath = runtime.backend.assets.resolveAssetPath(asset.url)
    if (!filePath) throw new ProviderExecutionError('asset_not_found', `Asset not found: ${asset.id}`, false)
    const bytes = await readFile(filePath)
    const mimeType = asset.mimeType ?? mimeTypeForPath(filePath)
    return {
      ...asset,
      url: `data:${mimeType};base64,${bytes.toString('base64')}`,
    }
  }
  return {
    ...input,
    attachments: await Promise.all(input.attachments.map(resolveAsset)),
    upstreamResults: await Promise.all(input.upstreamResults.map(async (result) => ({
      ...result,
      assets: await Promise.all(result.assets.map(resolveAsset)),
    }))),
  }
}

async function providerFetch(
  url: string,
  apiKey: string,
  body: unknown,
  signal: AbortSignal,
  onRequest?: (request: NonNullable<NodeRunTrace['networkRequests']>[number]) => void,
) {
  requireKey(apiKey, 'provider API key')
  const headers = {
    Authorization: `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
  }
  onRequest?.({
    transport: 'http',
    method: 'POST',
    url,
    headers,
    body,
    recordedAt: Date.now(),
  })
  return fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
    signal,
  })
}

async function readProviderJson(response: Response) {
  const payload = await response.json().catch(() => undefined)
  if (!response.ok) {
    const error = asRecord(asRecord(payload).error)
    throw new ProviderExecutionError(
      stringValue(error.code) ?? `provider_http_${response.status}`,
      stringValue(error.message) ?? `Provider request failed with ${response.status}`,
      response.status === 408 || response.status === 409 || response.status === 429 || response.status >= 500,
    )
  }
  return payload
}

async function readOpenAIEventStream(
  response: Response,
  onEvent: (event: Record<string, unknown>) => void,
) {
  if (!response.ok) return readProviderJson(response)
  if (!response.body) throw new ProviderExecutionError('missing_response_body', 'Provider returned no response body', true)
  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let completed: unknown
  while (true) {
    const { value, done } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const frames = buffer.split('\n\n')
    buffer = frames.pop() ?? ''
    for (const frame of frames) {
      const line = frame.split('\n').find((item) => item.startsWith('data:'))
      if (!line) continue
      const data = line.slice(5).trim()
      if (!data || data === '[DONE]') continue
      const event = asRecord(JSON.parse(data))
      onEvent(event)
      if (event.type === 'response.completed') completed = event.response
      if (event.type === 'response.failed') {
        throw new ProviderExecutionError('provider_response_failed', 'Provider response failed', true)
      }
    }
  }
  if (!completed) throw new ProviderExecutionError('incomplete_stream', 'Provider stream ended before completion', true)
  return completed
}

function toAssetReference(asset: {
  id: string
  kind: string
  url: string
  fileName: string
  mimeType?: string
}): AssetReference {
  return {
    id: asset.id,
    kind: asset.kind === 'video' ? 'video' : asset.kind === 'image' ? 'image' : 'file',
    url: asset.url,
    name: asset.fileName,
    mimeType: asset.mimeType,
  }
}

function extractOutputText(response: Record<string, unknown>) {
  const direct = stringValue(response.output_text)
  if (direct) return direct
  return arrayValue(response.output)
    .map(asRecord)
    .flatMap((item) => arrayValue(item.content).map(asRecord))
    .filter((item) => item.type === 'output_text')
    .map((item) => stringValue(item.text) ?? '')
    .join('')
}

function requireKey(value: string, name: string) {
  if (!value) throw new ProviderExecutionError('missing_api_key', `${name} is not configured`, false)
}

function normalizeError(error: unknown) {
  if (error instanceof ProviderExecutionError) return error
  if (error instanceof Error && error.name === 'AbortError') {
    return new ProviderExecutionError('aborted', 'Node run was cancelled', false)
  }
  return new ProviderExecutionError(
    'execution_failed',
    error instanceof Error ? error.message : String(error),
    true,
  )
}

class ProviderExecutionError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly retryable: boolean,
  ) {
    super(message)
    this.name = 'ProviderExecutionError'
  }
}

function abortableDelay(ms: number, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    const timer = setTimeout(resolve, ms)
    signal.addEventListener('abort', () => {
      clearTimeout(timer)
      reject(signal.reason)
    }, { once: true })
  })
}

function mimeTypeForPath(filePath: string) {
  const extension = extname(filePath).toLowerCase()
  if (extension === '.png') return 'image/png'
  if (extension === '.jpg' || extension === '.jpeg') return 'image/jpeg'
  if (extension === '.webp') return 'image/webp'
  if (extension === '.mp4') return 'video/mp4'
  return 'application/octet-stream'
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
}

function arrayValue(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

function stringValue(value: unknown) {
  return typeof value === 'string' ? value : undefined
}
