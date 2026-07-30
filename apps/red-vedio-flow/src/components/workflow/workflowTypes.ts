import type { Node } from '@xyflow/react'
import type {
  NodeComposerData,
  NodeResult,
  NodeStatus,
  WorkflowInputFieldDefinition,
} from '@red-video-flow/workflow-core'

export type WorkflowNodeKind = 'text' | 'image' | 'video'

export type WorkflowNodeData = {
  [key: string]: unknown
  kind: WorkflowNodeKind
  status: NodeStatus
  title: string
  description: string
  promptPlaceholder: string
  composer: NodeComposerData
  results: NodeResult[]
  currentResultId?: string
  latestRunId?: string
  executionMode?: 'input' | 'generate'
  workflowInput?: WorkflowInputFieldDefinition
  serviceRole?: 'input' | 'output'
  serviceLabel?: string
}

export type WorkflowFlowNode = Node<WorkflowNodeData, 'workflow'>
