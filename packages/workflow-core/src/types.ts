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
