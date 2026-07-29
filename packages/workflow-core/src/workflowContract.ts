import type { MaterialNode, MaterialType, WorkflowDocument } from './types'

export type WorkflowContractField = {
  nodeId: string
  label: string
  type: MaterialType
  required: boolean
}

export type WorkflowContract = {
  workflowId: string
  revision: number
  title: string
  inputs: Record<string, WorkflowContractField>
  outputs: Record<string, WorkflowContractField>
}

export class WorkflowContractError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'WorkflowContractError'
  }
}

export function createWorkflowContract(workflow: WorkflowDocument): WorkflowContract {
  const inputs = contractFields(workflow.graph.nodes, 'input')
  const outputs = contractFields(workflow.graph.nodes, 'output')
  if (!Object.keys(inputs).length) throw new WorkflowContractError('workflow has no service inputs')
  if (!Object.keys(outputs).length) throw new WorkflowContractError('workflow has no service outputs')
  validateOutputReachability(workflow, inputs, outputs)
  return {
    workflowId: workflow.id,
    revision: workflow.revision,
    title: workflow.title,
    inputs,
    outputs,
  }
}

function contractFields(nodes: MaterialNode[], role: 'input' | 'output') {
  const result: Record<string, WorkflowContractField> = {}
  for (const node of nodes) {
    if (node.data.serviceRole !== role) continue
    const label = node.data.serviceLabel?.trim()
    if (!label) throw new WorkflowContractError(`${role} node ${node.id} has no service label`)
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(label)) {
      throw new WorkflowContractError(`invalid service label: ${label}`)
    }
    if (result[label]) throw new WorkflowContractError(`duplicate ${role} label: ${label}`)
    result[label] = {
      nodeId: node.id,
      label,
      type: node.data.materialType,
      required: role === 'input',
    }
  }
  return result
}

function validateOutputReachability(
  workflow: WorkflowDocument,
  inputs: Record<string, WorkflowContractField>,
  outputs: Record<string, WorkflowContractField>,
) {
  const reachable = new Set(Object.values(inputs).map((field) => field.nodeId))
  let changed = true
  while (changed) {
    changed = false
    for (const edge of workflow.graph.edges) {
      if (reachable.has(edge.source) && !reachable.has(edge.target)) {
        reachable.add(edge.target)
        changed = true
      }
    }
  }
  for (const field of Object.values(outputs)) {
    if (!reachable.has(field.nodeId)) {
      throw new WorkflowContractError(`output ${field.label} is not reachable from an input`)
    }
  }
}
