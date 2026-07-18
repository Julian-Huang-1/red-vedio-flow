import type { MaterialNode, WorkflowEdge } from './types'

export function getUpstreamNodes(nodes: MaterialNode[], edges: WorkflowEdge[], nodeId: string) {
  const sourceIds = new Set(edges.filter((edge) => edge.target === nodeId).map((edge) => edge.source))
  return nodes.filter((node) => sourceIds.has(node.id))
}

export function getDownstreamNodes(nodes: MaterialNode[], edges: WorkflowEdge[], nodeId: string) {
  const targetIds = new Set(edges.filter((edge) => edge.source === nodeId).map((edge) => edge.target))
  return nodes.filter((node) => targetIds.has(node.id))
}

export function summarizeNode(node: MaterialNode) {
  if (node.data.value.text) return `${node.data.title}: ${node.data.value.text}`
  if (node.data.value.fileName) return `${node.data.title}: ${node.data.value.fileName}`
  return `${node.data.title}: 空素材`
}
