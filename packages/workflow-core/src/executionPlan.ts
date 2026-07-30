import type { MaterialNode, WorkflowEdge } from './types'

export type WorkflowGraphValidationErrorCode =
  | 'empty_graph'
  | 'duplicate_node_id'
  | 'duplicate_edge'
  | 'missing_source_node'
  | 'missing_target_node'
  | 'self_connection'
  | 'cycle'

export type WorkflowGraphValidationIssue = {
  code: WorkflowGraphValidationErrorCode
  message: string
  nodeIds?: string[]
  edgeIds?: string[]
}

export type PlannedWorkflowNode = {
  nodeId: string
  level: number
  dependencies: string[]
}

export type WorkflowExecutionPlan = {
  levels: string[][]
  nodes: Record<string, PlannedWorkflowNode>
  startNodeIds: string[]
}

export type WorkflowGraph = {
  nodes: MaterialNode[]
  edges: WorkflowEdge[]
}

export function validateWorkflowGraph(graph: WorkflowGraph): WorkflowGraphValidationIssue[] {
  const errors: WorkflowGraphValidationIssue[] = []
  if (!graph.nodes.length) {
    return [{ code: 'empty_graph', message: '工作流画布为空' }]
  }

  const nodeCounts = new Map<string, number>()
  for (const node of graph.nodes) nodeCounts.set(node.id, (nodeCounts.get(node.id) ?? 0) + 1)
  for (const [nodeId, count] of nodeCounts) {
    if (count > 1) {
      errors.push({
        code: 'duplicate_node_id',
        message: `节点 ID 重复：${nodeId}`,
        nodeIds: [nodeId],
      })
    }
  }

  const nodeIds = new Set(graph.nodes.map((node) => node.id))
  const connectionKeys = new Map<string, WorkflowEdge[]>()
  for (const edge of graph.edges) {
    const edgeIds = edge.id ? [edge.id] : undefined
    if (!nodeIds.has(edge.source)) {
      errors.push({
        code: 'missing_source_node',
        message: `连线引用了不存在的起点：${edge.source}`,
        nodeIds: [edge.source],
        edgeIds,
      })
    }
    if (!nodeIds.has(edge.target)) {
      errors.push({
        code: 'missing_target_node',
        message: `连线引用了不存在的终点：${edge.target}`,
        nodeIds: [edge.target],
        edgeIds,
      })
    }
    if (edge.source === edge.target) {
      errors.push({
        code: 'self_connection',
        message: `节点不能连接到自身：${edge.source}`,
        nodeIds: [edge.source],
        edgeIds,
      })
    }
    const key = `${edge.source}\0${edge.target}`
    const matches = connectionKeys.get(key) ?? []
    matches.push(edge)
    connectionKeys.set(key, matches)
  }

  for (const [key, edges] of connectionKeys) {
    if (edges.length < 2) continue
    const [source, target] = key.split('\0')
    errors.push({
      code: 'duplicate_edge',
      message: `节点之间存在重复连线：${source} → ${target}`,
      nodeIds: [source, target],
      edgeIds: edges.flatMap((edge) => edge.id ? [edge.id] : []),
    })
  }

  if (!errors.some((error) => (
    error.code === 'duplicate_node_id'
    || error.code === 'missing_source_node'
    || error.code === 'missing_target_node'
    || error.code === 'self_connection'
    || error.code === 'duplicate_edge'
  ))) {
    const cycleNodeIds = findCycleNodeIds(graph)
    if (cycleNodeIds.length) {
      errors.push({
        code: 'cycle',
        message: `工作流存在循环依赖：${cycleNodeIds.join(' → ')}`,
        nodeIds: cycleNodeIds,
      })
    }
  }

  return errors
}

export function createExecutionPlan(graph: WorkflowGraph): WorkflowExecutionPlan {
  const errors = validateWorkflowGraph(graph)
  if (errors.length) {
    throw new WorkflowGraphValidationError(errors)
  }

  const nodeOrder = new Map(graph.nodes.map((node, index) => [node.id, index]))
  const dependencies = new Map(graph.nodes.map((node) => [node.id, [] as string[]]))
  const downstream = new Map(graph.nodes.map((node) => [node.id, [] as string[]]))
  const indegree = new Map(graph.nodes.map((node) => [node.id, 0]))

  for (const edge of graph.edges) {
    dependencies.get(edge.target)!.push(edge.source)
    downstream.get(edge.source)!.push(edge.target)
    indegree.set(edge.target, indegree.get(edge.target)! + 1)
  }

  const sortIds = (ids: string[]) => ids.sort(
    (left, right) => nodeOrder.get(left)! - nodeOrder.get(right)!,
  )
  let ready = sortIds(graph.nodes.filter((node) => indegree.get(node.id) === 0).map((node) => node.id))
  const levels: string[][] = []
  const plannedNodes: Record<string, PlannedWorkflowNode> = {}

  while (ready.length) {
    const currentLevel = ready
    levels.push(currentLevel)
    const nextReady: string[] = []
    for (const nodeId of currentLevel) {
      plannedNodes[nodeId] = {
        nodeId,
        level: levels.length - 1,
        dependencies: sortIds([...dependencies.get(nodeId)!]),
      }
      for (const targetId of downstream.get(nodeId)!) {
        const remaining = indegree.get(targetId)! - 1
        indegree.set(targetId, remaining)
        if (remaining === 0) nextReady.push(targetId)
      }
    }
    ready = sortIds(nextReady)
  }

  return {
    levels,
    nodes: plannedNodes,
    startNodeIds: levels[0] ?? [],
  }
}

export class WorkflowGraphValidationError extends Error {
  readonly errors: WorkflowGraphValidationIssue[]

  constructor(errors: WorkflowGraphValidationIssue[]) {
    super(errors.map((error) => error.message).join('；'))
    this.name = 'WorkflowGraphValidationError'
    this.errors = errors
  }
}

function findCycleNodeIds(graph: WorkflowGraph) {
  const indegree = new Map(graph.nodes.map((node) => [node.id, 0]))
  const downstream = new Map(graph.nodes.map((node) => [node.id, [] as string[]]))
  for (const edge of graph.edges) {
    indegree.set(edge.target, indegree.get(edge.target)! + 1)
    downstream.get(edge.source)!.push(edge.target)
  }
  const queue = graph.nodes.filter((node) => indegree.get(node.id) === 0).map((node) => node.id)
  for (let index = 0; index < queue.length; index += 1) {
    for (const targetId of downstream.get(queue[index])!) {
      const remaining = indegree.get(targetId)! - 1
      indegree.set(targetId, remaining)
      if (remaining === 0) queue.push(targetId)
    }
  }
  return graph.nodes.filter((node) => indegree.get(node.id)! > 0).map((node) => node.id)
}
