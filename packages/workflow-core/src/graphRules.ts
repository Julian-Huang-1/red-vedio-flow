import type { MaterialNode, MaterialType } from './types'

export function canConnect(source: MaterialType, target: MaterialType) {
  if (source === 'text') return true
  if (source === 'image') return target === 'image' || target === 'video'
  if (source === 'video') return target === 'video'
  return false
}

export function hasMaterialValue(node: MaterialNode) {
  return Boolean(node.data.value.text || node.data.value.url || node.data.value.fileName)
}

export function canConnectMaterialNodes(source: MaterialNode, target: MaterialNode) {
  if (!hasMaterialValue(source)) return false
  if (target.data.status === 'empty') return true
  return canConnect(source.data.materialType, target.data.materialType)
}
