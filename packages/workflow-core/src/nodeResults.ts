import type { MaterialNode, MaterialValue, NodeStatus } from './types'

export type MaterialNodeRunResult = {
  status: NodeStatus
  value: MaterialValue
}

export function createGeneratedValue(node: MaterialNode, text: string) {
  if (node.data.materialType === 'text') return { text }
  if (node.data.value.url) return node.data.value
  return { ...node.data.value, text }
}

export function applyMaterialNodeRunResult(node: MaterialNode, result: MaterialNodeRunResult): MaterialNode {
  return {
    ...node,
    data: {
      ...node.data,
      status: result.status,
      value: result.value,
    },
  }
}
