export type MaterialType = 'text' | 'image' | 'video' | 'audio'

export type NodeStatus = 'empty' | 'ready' | 'running' | 'done' | 'error'

export type MaterialValue = {
  text?: string
  url?: string
  localPath?: string
  submitId?: string
  provider?: string
  fileName?: string
  mimeType?: string
  duration?: number
}

export type MaterialMessage = {
  id: string
  role: 'user' | 'assistant'
  text: string
  createdAt: number
}

export type MaterialNodeData = {
  materialType: MaterialType
  title: string
  executionMode?: 'input' | 'generate'
  workflowInput?: WorkflowInputFieldDefinition
  serviceRole?: 'input' | 'output'
  serviceLabel?: string
  visualProviderId?: string
  visualProviderOptions?: Record<string, unknown>
  status: NodeStatus
  value: MaterialValue
  messages: MaterialMessage[]
  composer?: NodeComposerData
  results?: NodeResult[]
  currentResultId?: string
  latestRunId?: string
}

export type WorkflowInputValueType =
  | 'text'
  | 'number'
  | 'boolean'
  | 'image'
  | 'image[]'
  | 'video'
  | 'audio'
  | 'file'

export type WorkflowInputFieldDefinition = {
  key: string
  title: string
  description?: string
  valueType: WorkflowInputValueType
  required: boolean
  defaultValue?: unknown
  constraints?: {
    min?: number
    max?: number
    maxLength?: number
    minItems?: number
    maxItems?: number
    mimeTypes?: string[]
  }
}

export type XYPosition = {
  x: number
  y: number
}

export type NodeSize = {
  width: number
  height: number
}

export type MaterialNode = {
  id: string
  position: XYPosition
  width?: number
  height?: number
  data: MaterialNodeData
}

export type WorkflowEdge = {
  id?: string
  source: string
  target: string
}

export type WorkflowSubgraph = {
  id: string
  name: string
  nodeIds: string[]
  position?: XYPosition
  width?: number
  height?: number
  createdAt: number
  updatedAt: number
  capability?: WorkflowSubgraphCapability
}

export type CapabilityLabelTarget = {
  nodeId: string
  kind: 'node' | 'composer'
}

export type WorkflowCapabilityInput = {
  label: string
  target: CapabilityLabelTarget
  valueType: WorkflowInputValueType | MaterialType
  required?: boolean
}

export type WorkflowCapabilityOutput = {
  label: string
  target: CapabilityLabelTarget
  valueType: MaterialType
}

export type WorkflowSubgraphCapability = {
  inputs: WorkflowCapabilityInput[]
  outputs: WorkflowCapabilityOutput[]
}

export type SubgraphCapabilityManifest = {
  version: 1
  name: string
  workflowId: string
  workflowRevision: number
  subgraphId: string
  snapshot: WorkflowDocument
  inputs: WorkflowCapabilityInput[]
  outputs: WorkflowCapabilityOutput[]
}

export type WorkflowDocument = {
  schemaVersion: 1
  id: string
  title: string
  revision: number
  createdAt: number
  updatedAt: number
  graph: {
    nodes: MaterialNode[]
    edges: WorkflowEdge[]
    subgraphs?: WorkflowSubgraph[]
  }
}

export type WorkflowPatchOperation =
  | { type: 'setWorkflowTitle'; title: string }
  | { type: 'addNode'; node: MaterialNode }
  | { type: 'removeNode'; nodeId: string }
  | { type: 'moveNode'; nodeId: string; position: XYPosition }
  | { type: 'resizeNode'; nodeId: string; size: NodeSize }
  | { type: 'setNodeTitle'; nodeId: string; title: string }
  | {
      type: 'setNodeServiceBoundary'
      nodeId: string
      role?: 'input' | 'output'
      label?: string
    }
  | {
      type: 'setNodeVisualConfig'
      nodeId: string
      providerId?: string
      options?: Record<string, unknown>
    }
  | { type: 'setNodeStatus'; nodeId: string; status: NodeStatus }
  | { type: 'setNodeValue'; nodeId: string; value: MaterialValue }
  | { type: 'appendNodeMessage'; nodeId: string; message: MaterialMessage }
  | { type: 'setNodeComposer'; nodeId: string; composer: NodeComposerData }
  | { type: 'appendNodeResult'; nodeId: string; result: NodeResult; makeCurrent?: boolean }
  | { type: 'setNodeCurrentResult'; nodeId: string; resultId: string }
  | { type: 'setNodeLatestRun'; nodeId: string; runId?: string }
  | { type: 'addEdge'; edge: WorkflowEdge }
  | { type: 'removeEdge'; edgeId?: string; source?: string; target?: string }

export type WorkflowPatchInput = {
  baseRevision: number
  ops: WorkflowPatchOperation[]
}
import type { NodeComposerData, NodeResult } from './generationTypes'
