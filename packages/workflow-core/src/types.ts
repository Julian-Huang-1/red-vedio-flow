export type MaterialType = 'text' | 'image' | 'video'

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
  status: NodeStatus
  value: MaterialValue
  messages: MaterialMessage[]
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
  }
}

export type WorkflowPatchOperation =
  | { type: 'setWorkflowTitle'; title: string }
  | { type: 'addNode'; node: MaterialNode }
  | { type: 'removeNode'; nodeId: string }
  | { type: 'moveNode'; nodeId: string; position: XYPosition }
  | { type: 'resizeNode'; nodeId: string; size: NodeSize }
  | { type: 'setNodeTitle'; nodeId: string; title: string }
  | { type: 'setNodeStatus'; nodeId: string; status: NodeStatus }
  | { type: 'setNodeValue'; nodeId: string; value: MaterialValue }
  | { type: 'appendNodeMessage'; nodeId: string; message: MaterialMessage }
  | { type: 'addEdge'; edge: WorkflowEdge }
  | { type: 'removeEdge'; edgeId?: string; source?: string; target?: string }

export type WorkflowPatchInput = {
  baseRevision: number
  ops: WorkflowPatchOperation[]
}
