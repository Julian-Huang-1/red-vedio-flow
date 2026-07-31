import { randomUUID } from 'node:crypto'
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
        id: randomUUID(),
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
      : [result.video, ...(result.lastFrame ? [result.lastFrame] : [])]
    for (const asset of assets) {
      const now = Date.now()
      const blobId = blobIdFromUrl(asset.url)
      const resource: Resource = {
        id: randomUUID(),
        workspaceId: input.workflowId,
        kind: asset.kind,
        name: asset.name ?? (asset.kind === 'image' ? '生成图片' : '生成视频'),
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

function blobIdFromUrl(url: string) {
  return url.startsWith('/api/blobs/')
    ? decodeURIComponent(url.slice('/api/blobs/'.length))
    : undefined
}
