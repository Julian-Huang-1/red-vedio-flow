import { canConnectMaterialNodes } from './graphRules'
import type { MaterialNode, WorkflowDocument, WorkflowEdge, WorkflowPatchOperation } from './types'

export class WorkflowPatchError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'WorkflowPatchError'
  }
}

export function applyWorkflowPatch(document: WorkflowDocument, ops: WorkflowPatchOperation[]): WorkflowDocument {
  let title = document.title
  let nodes = document.graph.nodes
  let edges = document.graph.edges

  for (const op of ops) {
    switch (op.type) {
      case 'setWorkflowTitle':
        title = op.title
        break
      case 'addNode':
        ensureNodeMissing(nodes, op.node.id)
        nodes = [...nodes, op.node]
        break
      case 'removeNode':
        ensureNode(nodes, op.nodeId)
        nodes = nodes.filter((node) => node.id !== op.nodeId)
        edges = edges.filter((edge) => edge.source !== op.nodeId && edge.target !== op.nodeId)
        break
      case 'moveNode':
        nodes = updateNode(nodes, op.nodeId, (node) => ({ ...node, position: op.position }))
        break
      case 'resizeNode':
        nodes = updateNode(nodes, op.nodeId, (node) => ({ ...node, width: op.size.width, height: op.size.height }))
        break
      case 'setNodeTitle':
        nodes = updateNode(nodes, op.nodeId, (node) => ({
          ...node,
          data: { ...node.data, title: op.title },
        }))
        break
      case 'setNodeStatus':
        nodes = updateNode(nodes, op.nodeId, (node) => ({
          ...node,
          data: { ...node.data, status: op.status },
        }))
        break
      case 'setNodeValue':
        nodes = updateNode(nodes, op.nodeId, (node) => ({
          ...node,
          data: { ...node.data, value: op.value },
        }))
        break
      case 'appendNodeMessage':
        nodes = updateNode(nodes, op.nodeId, (node) => ({
          ...node,
          data: { ...node.data, messages: [...node.data.messages, op.message] },
        }))
        break
      case 'addEdge':
        ensureValidEdge(nodes, edges, op.edge)
        edges = [...edges, op.edge]
        break
      case 'removeEdge':
        edges = removeEdge(edges, op)
        break
      default:
        assertNever(op)
    }
  }

  return {
    ...document,
    title,
    graph: { nodes, edges },
  }
}

function updateNode(nodes: MaterialNode[], nodeId: string, update: (node: MaterialNode) => MaterialNode) {
  let found = false
  const nextNodes = nodes.map((node) => {
    if (node.id !== nodeId) return node
    found = true
    return update(node)
  })
  if (!found) throw new WorkflowPatchError(`node not found: ${nodeId}`)
  return nextNodes
}

function ensureNode(nodes: MaterialNode[], nodeId: string) {
  if (!nodes.some((node) => node.id === nodeId)) throw new WorkflowPatchError(`node not found: ${nodeId}`)
}

function ensureNodeMissing(nodes: MaterialNode[], nodeId: string) {
  if (nodes.some((node) => node.id === nodeId)) throw new WorkflowPatchError(`node already exists: ${nodeId}`)
}

function ensureValidEdge(nodes: MaterialNode[], edges: WorkflowEdge[], edge: WorkflowEdge) {
  const source = nodes.find((node) => node.id === edge.source)
  const target = nodes.find((node) => node.id === edge.target)
  if (!source) throw new WorkflowPatchError(`source node not found: ${edge.source}`)
  if (!target) throw new WorkflowPatchError(`target node not found: ${edge.target}`)
  if (source.id === target.id) throw new WorkflowPatchError('edge cannot connect a node to itself')
  if (edges.some((item) => edgeMatches(item, edge))) return
  if (!canConnectMaterialNodes(source, target)) throw new WorkflowPatchError('edge violates material connection rules')
}

function removeEdge(edges: WorkflowEdge[], op: Extract<WorkflowPatchOperation, { type: 'removeEdge' }>) {
  const nextEdges = edges.filter((edge) => {
    if (op.edgeId && edge.id === op.edgeId) return false
    if (op.source && op.target && edge.source === op.source && edge.target === op.target) return false
    return true
  })
  if (nextEdges.length === edges.length) throw new WorkflowPatchError('edge not found')
  return nextEdges
}

function edgeMatches(left: WorkflowEdge, right: WorkflowEdge) {
  if (left.id && right.id && left.id === right.id) return true
  return left.source === right.source && left.target === right.target
}

function assertNever(value: never): never {
  throw new WorkflowPatchError(`unsupported workflow patch operation: ${JSON.stringify(value)}`)
}
