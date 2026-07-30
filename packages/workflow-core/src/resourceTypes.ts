export type ResourceKind = 'text' | 'image' | 'video' | 'file'
export type ResourceSource = 'upload' | 'generated' | 'imported'
export type ResourceRelation =
  | 'generated'
  | 'attachment'
  | 'node-content'
  | 'upstream-input'
  | 'last-frame'
  | 'cover'

export type Resource = {
  id: string
  workspaceId: string
  kind: ResourceKind
  name: string
  mimeType?: string
  text?: string
  url?: string
  localPath?: string
  fileName?: string
  size?: number
  width?: number
  height?: number
  duration?: number
  thumbnailUrl?: string
  source: ResourceSource
  sourceNodeId?: string
  sourceRunId?: string
  sourceResultId?: string
  providerId?: string
  modelId?: string
  prompt?: string
  generationConfig?: Record<string, unknown>
  createdAt: number
  updatedAt: number
  deletedAt?: number
}

export type ResourceBinding = {
  id: string
  resourceId: string
  workflowId: string
  nodeId?: string
  runId?: string
  resultId?: string
  relation: ResourceRelation
  createdAt: number
}
