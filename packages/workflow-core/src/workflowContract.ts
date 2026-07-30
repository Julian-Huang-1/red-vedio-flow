import type {
  MaterialNode,
  MaterialType,
  WorkflowDocument,
  WorkflowInputFieldDefinition,
  WorkflowInputValueType,
} from './types'

export type WorkflowContractField = {
  nodeId: string
  label: string
  type: MaterialType | WorkflowInputValueType
  required: boolean
  title?: string
  description?: string
  defaultValue?: unknown
  constraints?: WorkflowInputFieldDefinition['constraints']
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
    if (node.data.serviceRole !== role && !(role === 'input' && node.data.workflowInput)) continue
    const workflowInput = role === 'input' ? node.data.workflowInput : undefined
    const label = workflowInput?.key.trim() || node.data.serviceLabel?.trim()
    if (!label) throw new WorkflowContractError(`${role} node ${node.id} has no service label`)
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(label)) {
      throw new WorkflowContractError(`invalid service label: ${label}`)
    }
    if (result[label]) throw new WorkflowContractError(`duplicate ${role} label: ${label}`)
    result[label] = {
      nodeId: node.id,
      label,
      type: workflowInput?.valueType ?? node.data.materialType,
      required: workflowInput?.required ?? role === 'input',
      title: workflowInput?.title,
      description: workflowInput?.description,
      defaultValue: workflowInput?.defaultValue,
      constraints: workflowInput?.constraints,
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
