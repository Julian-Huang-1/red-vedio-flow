import type {
  PluginAsset,
  VisualCapability,
  VisualQueryResult,
  VisualSubmitResult,
} from '@red-video-flow/plugin-contract'
import type {
  InvokeVisualModelInput,
  QueryVisualTaskInput,
  VisualEvent,
  VisualRunResult,
  VisualServiceContract,
} from '../visual/service.js'
import type { PluginManager } from './pluginManager.js'

export type PluginVisualServiceOptions = {
  requestTimeoutMs?: number
}

export class PluginVisualService implements VisualServiceContract {
  constructor(
    private readonly plugins: PluginManager,
    private readonly options: PluginVisualServiceOptions = {},
  ) {}

  listModels() {
    const models = this.plugins.contributions.listVisualProviders().map(({ contribution }) => ({
      id: contribution.id,
      label: contribution.title,
      vendor: contribution.vendor ?? 'Plugin',
      available: true,
      invokable: true,
      binPath: null,
      capabilities: contribution.capabilities,
    }))
    return {
      models,
      installedCount: models.length,
      invokableCount: models.length,
    }
  }

  async invoke(input: InvokeVisualModelInput): Promise<VisualRunResult> {
    const registered = this.plugins.contributions.getVisualProvider(input.modelId)
    if (!registered) throw new Error(`unknown visual provider: ${input.modelId}`)
    const executionId = input.executionId ?? createVisualExecutionId('submit')
    const removeListener = this.forwardEvents(executionId, input.modelId, input.onEvent)
    try {
      const capability = selectCapability(input.nodeKind, input.upstream)
      const result = await this.plugins.call<VisualSubmitResult>(
        registered.pluginId,
        'visual.submit',
        {
          executionId,
          contributionId: input.modelId,
          input: {
            executionId,
            capability,
            prompt: input.prompt,
            inputs: upstreamAssets(input.upstream),
            options: {
              ...input.providerOptions,
              downloadDir: input.downloadDir,
            },
            idempotencyKey: input.idempotencyKey ?? executionId,
          },
        },
        this.options.requestTimeoutMs,
      )
      return submitResultToLegacy(result, input.assetUrlForPath)
    } catch (error) {
      await this.cancel(executionId, registered.pluginId)
      throw error
    } finally {
      removeListener()
    }
  }

  async query(input: QueryVisualTaskInput): Promise<VisualRunResult> {
    const providerId = 'providerId' in input && typeof input.providerId === 'string'
      ? input.providerId
      : 'dreamina'
    const registered = this.plugins.contributions.getVisualProvider(providerId)
    if (!registered) throw new Error(`unknown visual provider: ${providerId}`)
    const executionId = input.executionId ?? createVisualExecutionId('query')
    const removeListener = this.forwardEvents(executionId, providerId, input.onEvent)
    try {
      const result = await this.plugins.call<VisualQueryResult>(
        registered.pluginId,
        'visual.query',
        {
          executionId,
          contributionId: providerId,
          input: {
            executionId,
            externalTaskId: input.submitId,
            options: { downloadDir: input.downloadDir },
          },
        },
        this.options.requestTimeoutMs,
      )
      return queryResultToLegacy(input.submitId, result, input.assetUrlForPath)
    } catch (error) {
      await this.cancel(executionId, registered.pluginId)
      throw error
    } finally {
      removeListener()
    }
  }

  private forwardEvents(
    executionId: string,
    modelId: string,
    onEvent?: (event: VisualEvent) => void,
  ) {
    return this.plugins.onNotification((event) => {
      if (event.method !== 'execution.event' || !isRecord(event.params)) return
      if (event.params.executionId !== executionId || typeof event.params.type !== 'string') return
      const data = isRecord(event.params.data) ? event.params.data : {}
      if (event.params.type === 'stderr' && typeof data.text === 'string') {
        onEvent?.({ type: 'stderr', text: data.text })
      } else if (event.params.type === 'submitted' && typeof data.externalTaskId === 'string') {
        onEvent?.({ type: 'meta', submitId: data.externalTaskId })
      } else if (
        event.params.type === 'progress'
        && data.phase === 'spawned'
        && typeof data.bin === 'string'
        && Array.isArray(data.argv)
      ) {
        onEvent?.({ type: 'start', modelId, bin: data.bin, argv: data.argv.map(String) })
      } else if (event.params.type === 'progress' && typeof data.text === 'string') {
        onEvent?.({ type: 'stdout', text: data.text })
      }
    })
  }

  private async cancel(executionId: string, pluginId: string) {
    try {
      await this.plugins.call(pluginId, 'execution.cancel', { executionId }, 5_000)
    } catch {}
  }
}

function selectCapability(nodeKind: string, upstream: unknown[] | undefined): VisualCapability {
  const hasImage = (upstream ?? []).some((node) => {
    if (!isRecord(node)) return false
    const data = isRecord(node.data) ? node.data : undefined
    const value = data && isRecord(data.value) ? data.value : undefined
    return data?.materialType === 'image' && typeof value?.localPath === 'string'
  })
  if (nodeKind === 'image') return hasImage ? 'image-to-image' : 'text-to-image'
  if (nodeKind === 'video') return hasImage ? 'image-to-video' : 'text-to-video'
  throw new Error(`unsupported visual node kind: ${nodeKind}`)
}

function upstreamAssets(upstream: unknown[] | undefined): PluginAsset[] {
  const assets: PluginAsset[] = []
  for (const node of upstream ?? []) {
    if (!isRecord(node) || !isRecord(node.data) || !isRecord(node.data.value)) continue
    const value = node.data.value
    if (typeof value.localPath !== 'string' && typeof value.url !== 'string') continue
    assets.push({
      localPath: typeof value.localPath === 'string' ? value.localPath : undefined,
      remoteUrl: typeof value.url === 'string' && /^https?:\/\//.test(value.url) ? value.url : undefined,
      fileName: typeof value.fileName === 'string' ? value.fileName : undefined,
      mimeType: typeof value.mimeType === 'string' ? value.mimeType : undefined,
    })
  }
  return assets
}

function submitResultToLegacy(
  result: VisualSubmitResult,
  assetUrlForPath: (filePath: string) => string,
): VisualRunResult {
  if (result.status === 'pending') {
    return {
      submitId: result.externalTaskId,
      taskStatus: 'querying',
      text: result.text,
    }
  }
  return assetToLegacy(result.assets[0], assetUrlForPath, {
    taskStatus: 'success',
    text: result.text,
  })
}

function queryResultToLegacy(
  submitId: string,
  result: VisualQueryResult,
  assetUrlForPath: (filePath: string) => string,
): VisualRunResult {
  if (result.status === 'pending') {
    return { submitId, taskStatus: 'querying', text: result.text }
  }
  if (result.status === 'failed') {
    return {
      submitId,
      taskStatus: 'failed',
      failReason: result.message,
      text: result.message,
    }
  }
  return assetToLegacy(result.assets[0], assetUrlForPath, {
    submitId,
    taskStatus: 'success',
    text: result.text,
  })
}

function assetToLegacy(
  asset: PluginAsset | undefined,
  assetUrlForPath: (filePath: string) => string,
  base: VisualRunResult,
): VisualRunResult {
  if (!asset) return base
  return {
    ...base,
    url: asset.localPath ? assetUrlForPath(asset.localPath) : asset.remoteUrl,
    localPath: asset.localPath,
    fileName: asset.fileName,
    mimeType: asset.mimeType,
  }
}

function createVisualExecutionId(action: string) {
  return `visual-${action}-${Date.now()}-${Math.round(Math.random() * 1_000_000)}`
}

function isRecord(value: unknown): value is Record<string, any> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}
