import type { MaterialNode, MaterialType, NodeSize, XYPosition } from './types'

export type CreateMaterialNodeInput = {
  id: string
  materialType: MaterialType
  position: XYPosition
  title: string
  size?: NodeSize
}

export function createMaterialNode(input: CreateMaterialNodeInput): MaterialNode {
  return {
    id: input.id,
    position: input.position,
    width: input.size?.width,
    height: input.size?.height,
    data: {
      materialType: input.materialType,
      title: input.title,
      status: 'empty',
      value: {},
      messages: [],
    },
  }
}
