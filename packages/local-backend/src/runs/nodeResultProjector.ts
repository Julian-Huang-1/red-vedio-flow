import type {
  AssetReference,
  ImageNodeResult,
  NodeResult,
  NodeRun,
  VideoNodeResult,
} from '@red-video-flow/workflow-core'
import type { AssetService, UploadedAsset } from '../assets/assetService.js'
import type { ResourceService } from '../resources/resourceService.js'
import type { WorkflowService } from '../workflows/workflowService.js'
import type { VisualRunResult } from '../visual/service.js'
import type { RunService } from './runService.js'

export class NodeResultProjector {
  constructor(
    private readonly workflows: WorkflowService,
    private readonly runs: RunService,
    private readonly assets: AssetService,
    private readonly resources: ResourceService,
  ) {}

  projectVisual(runId: string, visual: VisualRunResult) {
    const run = this.runs.getNodeRun(runId)
    if (!run) throw new Error(`node run not found: ${runId}`)
    const workflow = this.workflows.get(run.workflowId)
    if (!workflow) throw new Error(`workflow not found: ${run.workflowId}`)
    const node = workflow.graph.nodes.find((item) => item.id === run.nodeId)
    if (!node) throw new Error(`node not found: ${run.nodeId}`)

    const existing = (node.data.results ?? []).filter((result) => result.runId === runId)
    if (existing.length) {
      this.runs.completeNodeRun(runId, existing, workflow.revision)
      return existing
    }

    const resultId = `result-${runId}`
    const registered = this.registerVisualAssets(run, resultId, visual)
    const result = run.inputSnapshot.generationConfig.type === 'openai-image'
      ? this.imageResult(run, resultId, registered, visual)
      : this.videoResult(run, resultId, registered, visual)

    const latest = this.workflows.get(run.workflowId)!
    const patched = this.workflows.patch({
      id: run.workflowId,
      baseRevision: latest.revision,
      ops: [
        { type: 'setNodeLatestRun', nodeId: run.nodeId, runId },
        { type: 'appendNodeResult', nodeId: run.nodeId, result, makeCurrent: true },
        { type: 'setNodeStatus', nodeId: run.nodeId, status: 'done' },
      ],
    })
    this.runs.completeNodeRun(runId, [result], patched.revision)
    return [result]
  }

  fail(runId: string, input: {
    code?: string
    message: string
    retryable: boolean
    status?: 'failed' | 'timed_out' | 'interrupted'
  }) {
    return this.runs.failNodeRun(runId, input)
  }

  private registerVisualAssets(run: NodeRun, resultId: string, visual: VisualRunResult) {
    const source = visual.assets?.length ? visual.assets : [{
      url: visual.url,
      localPath: visual.localPath,
      fileName: visual.fileName,
      mimeType: visual.mimeType,
      role: 'output' as const,
    }]
    return source.flatMap((asset, index) => {
      if (!asset.localPath || !asset.url) return []
      const fallbackKind = run.inputSnapshot.generationConfig.type === 'openai-image' ? 'image' : 'video'
      const kind = asset.role === 'last_frame' || asset.mimeType?.startsWith('image/')
        ? 'image'
        : asset.mimeType?.startsWith('video/')
          ? 'video'
          : fallbackKind
      const registered = this.assets.register({
        workflowId: run.workflowId,
        kind,
        url: asset.url,
        localPath: asset.localPath,
        fileName: asset.fileName ?? `result-${index + 1}.${kind === 'image' ? 'png' : 'mp4'}`,
        mimeType: asset.mimeType,
        provider: run.inputSnapshot.model.providerId,
        source: 'generated',
        sourceNodeId: run.nodeId,
        sourceRunId: run.id,
        sourceResultId: resultId,
        modelId: run.inputSnapshot.model.modelId,
        prompt: run.inputSnapshot.prompt,
        generationConfig: run.inputSnapshot.generationConfig as unknown as Record<string, unknown>,
      })
      this.resources.bind({
        resourceId: registered.id,
        workflowId: run.workflowId,
        nodeId: run.nodeId,
        runId: run.id,
        resultId,
        relation: asset.role === 'last_frame' ? 'last-frame' : 'generated',
      })
      return [registered]
    })
  }

  private imageResult(
    run: NodeRun,
    resultId: string,
    assets: UploadedAsset[],
    visual: VisualRunResult,
  ): ImageNodeResult {
    const images = assets.filter((asset) => asset.kind === 'image')
    if (!images.length) throw new Error('image task completed without image assets')
    const metadata = record(visual.metadata)
    return {
      id: resultId,
      runId: run.id,
      type: 'image',
      images: images.map(toAssetReference),
      provider: {
        providerId: run.inputSnapshot.model.providerId,
        taskId: visual.submitId,
        responseId: stringValue(metadata.responseId),
        raw: metadata,
      },
      createdAt: Date.now(),
    }
  }

  private videoResult(
    run: NodeRun,
    resultId: string,
    assets: UploadedAsset[],
    visual: VisualRunResult,
  ): VideoNodeResult {
    const video = assets.find((asset) => asset.kind === 'video')
    if (!video) throw new Error('video task completed without video asset')
    const lastFrame = assets.find((asset) => asset.kind === 'image')
    return {
      id: resultId,
      runId: run.id,
      type: 'video',
      video: toAssetReference(video),
      lastFrame: lastFrame ? toAssetReference(lastFrame) : undefined,
      provider: {
        providerId: run.inputSnapshot.model.providerId,
        taskId: visual.submitId,
      },
      createdAt: Date.now(),
    }
  }
}

function toAssetReference(asset: UploadedAsset): AssetReference {
  return {
    id: asset.id,
    kind: asset.kind === 'image' || asset.kind === 'video' ? asset.kind : 'file',
    url: asset.url,
    name: asset.fileName,
    mimeType: asset.mimeType,
  }
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
}

function stringValue(value: unknown) {
  return typeof value === 'string' ? value : undefined
}
