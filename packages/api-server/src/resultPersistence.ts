import { createHash } from 'node:crypto'
import type {
  NodeResult,
  Resource,
  ResourceBinding,
} from '@red-video-flow/workflow-core'
import type { CreateResourceBindingInput } from './resourceRoutes.js'

export type GeneratedResourceStore = {
  save(resource: Resource, blobId?: string): Promise<unknown>
  bind(input: CreateResourceBindingInput): Promise<ResourceBinding>
}

export async function persistGeneratedResultResources(input: {
  resources: GeneratedResourceStore
  workflowId: string
  nodeId: string
  runId: string
  results: NodeResult[]
}) {
  for (const result of input.results) {
    if (result.type === 'text') {
      const now = Date.now()
      const resource: Resource = {
        id: stableResourceId(input.runId, result.id, 'text'),
        workspaceId: input.workflowId,
        kind: 'text',
        name: '生成文本',
        text: result.text,
        source: 'generated',
        sourceNodeId: input.nodeId,
        sourceRunId: input.runId,
        sourceResultId: result.id,
        providerId: result.provider.providerId,
        createdAt: now,
        updatedAt: now,
      }
      await input.resources.save(resource)
      await input.resources.bind({
        resourceId: resource.id,
        workflowId: input.workflowId,
        nodeId: input.nodeId,
        runId: input.runId,
        resultId: result.id,
        relation: 'generated',
      })
      result.resourceId = resource.id
      continue
    }

    const assets = result.type === 'image'
      ? result.images
      : result.type === 'video'
        ? [result.video, ...(result.lastFrame ? [result.lastFrame] : [])]
        : [result.audio]
    for (const [assetIndex, asset] of assets.entries()) {
      const now = Date.now()
      const blobId = blobIdFromUrl(asset.url)
      const resource: Resource = {
        id: stableResourceId(input.runId, result.id, String(assetIndex)),
        workspaceId: input.workflowId,
        kind: asset.kind,
        name: asset.name ?? (asset.kind === 'image' ? '生成图片' : asset.kind === 'video' ? '生成视频' : '生成音频'),
        mimeType: asset.mimeType,
        url: asset.url,
        fileName: asset.name,
        size: asset.size,
        source: 'generated',
        sourceNodeId: input.nodeId,
        sourceRunId: input.runId,
        sourceResultId: result.id,
        providerId: result.provider.providerId,
        createdAt: now,
        updatedAt: now,
      }
      await input.resources.save(resource, blobId)
      await input.resources.bind({
        resourceId: resource.id,
        workflowId: input.workflowId,
        nodeId: input.nodeId,
        runId: input.runId,
        resultId: result.id,
        relation: result.type === 'video' && asset === result.lastFrame
          ? 'last-frame'
          : 'generated',
      })
      asset.id = resource.id
    }
  }
  return input.results
}

function stableResourceId(...parts: string[]) {
  const hex = createHash('sha256').update(parts.join('\u0000')).digest('hex').slice(0, 32)
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-5${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20)}`
}

function blobIdFromUrl(url: string) {
  return url.startsWith('/api/blobs/')
    ? decodeURIComponent(url.slice('/api/blobs/'.length))
    : undefined
}
