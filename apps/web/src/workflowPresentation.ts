import type { Node } from '@xyflow/react'
import type { MaterialNode, MaterialNodeData, MaterialType, NodeSize, XYPosition } from '@red-video-flow/workflow-core'
import { createMaterialNode } from '@red-video-flow/workflow-core'

export type AddNodeMenuState = {
  open: boolean
  screenX: number
  screenY: number
  flowX: number
  flowY: number
}

export type FlowNode = Node<MaterialNodeData, 'material'>

export const materialTypeLabels: Record<MaterialType, string> = {
  text: '文本节点',
  image: '图片节点',
  video: '视频节点',
}

export const defaultNodeSize: Record<MaterialType, NodeSize> = {
  text: { width: 360, height: 220 },
  image: { width: 560, height: 280 },
  video: { width: 560, height: 280 },
}

export function createFlowNode(materialType: MaterialType, position: XYPosition): FlowNode {
  return toFlowNode(
    createMaterialNode({
      id: createNodeId(materialType),
      materialType,
      position,
      title: createNodeTitle(materialType),
      size: defaultNodeSize[materialType],
    }),
  )
}

export function toFlowNode(node: MaterialNode): FlowNode {
  return {
    ...node,
    type: 'material',
  }
}

export function toMaterialNode(node: FlowNode): MaterialNode {
  return {
    id: node.id,
    position: node.position,
    width: node.width,
    height: node.height,
    data: node.data,
  }
}

function createNodeId(materialType: MaterialType) {
  return `${materialType}-${Date.now()}-${Math.round(Math.random() * 1000)}`
}

function createNodeTitle(materialType: MaterialType) {
  return `${materialTypeLabels[materialType]} ${Math.floor(Math.random() * 90) + 10}`
}
