import { createExecutionPlan } from './executionPlan'
import type {
  MaterialNode,
  WorkflowDocument,
  WorkflowInputFieldDefinition,
  WorkflowInputValueType,
} from './types'

export type WorkflowInputSchema = Record<string, WorkflowInputFieldDefinition & { nodeId: string }>

export type GeneratedWorkflowModule = {
  code: string
  inputSchema: WorkflowInputSchema
}

export function collectWorkflowInputSchema(workflow: WorkflowDocument): WorkflowInputSchema {
  const schema: WorkflowInputSchema = {}
  for (const node of workflow.graph.nodes) {
    const field = inputDefinition(node)
    if (!field) continue
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(field.key)) {
      throw new Error(`invalid workflow input key: ${field.key}`)
    }
    if (schema[field.key]) throw new Error(`duplicate workflow input key: ${field.key}`)
    schema[field.key] = { ...field, nodeId: node.id }
  }
  return schema
}

export function generateWorkflowModule(
  workflow: WorkflowDocument,
  options: { language?: 'js' | 'ts' } = {},
): GeneratedWorkflowModule {
  const language = options.language ?? 'ts'
  const plan = createExecutionPlan(workflow.graph)
  const inputSchema = collectWorkflowInputSchema(workflow)
  const nodeById = new Map(workflow.graph.nodes.map((node) => [node.id, node]))
  const variableNames = uniqueVariableNames(workflow.graph.nodes)
  const lines: string[] = [
    `// Generated from workflow ${JSON.stringify(workflow.title)} at revision ${workflow.revision}.`,
    `import { defineWorkflow } from '@red-video-flow/workflow-runtime'`,
    '',
  ]

  if (language === 'ts') {
    lines.push('export type WorkflowAssetInput = {')
    lines.push('  url?: string')
    lines.push('  localPath?: string')
    lines.push('  fileName?: string')
    lines.push('  mimeType?: string')
    lines.push('}', '')
    lines.push('export type WorkflowInput = {')
    for (const [key, field] of Object.entries(inputSchema)) {
      lines.push(`  ${key}${field.required ? '' : '?'}: ${typescriptType(field.valueType)}`)
    }
    lines.push('}', '')
  }

  lines.push(
    `export const inputSchema = ${JSON.stringify(inputSchema, null, 2)}${language === 'ts' ? ' as const' : ''}`,
    '',
  )
  lines.push(`export default defineWorkflow${language === 'ts' ? '<WorkflowInput>' : ''}({`)
  lines.push(`  id: ${JSON.stringify(workflow.id)},`)
  lines.push(`  revision: ${workflow.revision},`)
  lines.push('  inputSchema,')
  lines.push('  async run(input, runtime) {')
  lines.push('    const results = Object.create(null)')

  for (const level of plan.levels) {
    const executable = level.filter((nodeId) => !inputDefinition(nodeById.get(nodeId)!))
    for (const nodeId of level.filter((id) => Boolean(inputDefinition(nodeById.get(id)!)))) {
      const field = inputDefinition(nodeById.get(nodeId)!)!
      lines.push(`    const ${variableNames[nodeId]} = await runtime.resolveInput(${JSON.stringify(nodeId)}, input[${JSON.stringify(field.key)}], inputSchema[${JSON.stringify(field.key)}])`)
      lines.push(`    results[${JSON.stringify(nodeId)}] = ${variableNames[nodeId]}`)
    }
    if (!executable.length) continue
    if (executable.length === 1) {
      const nodeId = executable[0]
      lines.push(...runNodeLines(nodeById.get(nodeId)!, variableNames[nodeId], plan.nodes[nodeId].dependencies, variableNames, false))
      lines.push(`    results[${JSON.stringify(nodeId)}] = ${variableNames[nodeId]}`)
      continue
    }
    lines.push(`    const [${executable.map((id) => variableNames[id]).join(', ')}] = await Promise.all([`)
    for (const nodeId of executable) {
      lines.push(...runNodeLines(nodeById.get(nodeId)!, variableNames[nodeId], plan.nodes[nodeId].dependencies, variableNames, true))
    }
    lines.push('    ])')
    for (const nodeId of executable) {
      lines.push(`    results[${JSON.stringify(nodeId)}] = ${variableNames[nodeId]}`)
    }
  }

  const outputNodes = workflow.graph.nodes.filter((node) => node.data.serviceRole === 'output')
  lines.push('    return {')
  for (const node of outputNodes) {
    const key = node.data.serviceLabel?.trim() || node.id
    lines.push(`      ${JSON.stringify(key)}: results[${JSON.stringify(node.id)}],`)
  }
  lines.push('    }')
  lines.push('  },')
  lines.push('})', '')

  return { code: lines.join('\n'), inputSchema }
}

function runNodeLines(
  node: MaterialNode,
  variableName: string,
  dependencies: string[],
  variableNames: Record<string, string>,
  arrayItem: boolean,
) {
  const indent = arrayItem ? '      ' : '    '
  const prefix = arrayItem ? '' : `const ${variableName} = `
  return [
    `${indent}${prefix}runtime.runNode({`,
    `${indent}  node: ${JSON.stringify(node)},`,
    `${indent}  upstreamResults: [${dependencies.map((id) => variableNames[id]).join(', ')}],`,
    `${indent}})${arrayItem ? ',' : ''}`,
  ]
}

function inputDefinition(node: MaterialNode) {
  if (node.data.workflowInput) return node.data.workflowInput
  if (node.data.serviceRole !== 'input') return undefined
  const key = node.data.serviceLabel?.trim()
  if (!key) throw new Error(`input node ${node.id} has no input key`)
  return {
    key,
    title: node.data.title,
    valueType: node.data.materialType,
    required: true,
  } satisfies WorkflowInputFieldDefinition
}

function typescriptType(type: WorkflowInputValueType) {
  if (type === 'text') return 'string'
  if (type === 'number') return 'number'
  if (type === 'boolean') return 'boolean'
  if (type === 'image[]') return 'WorkflowAssetInput[]'
  return 'WorkflowAssetInput'
}

function uniqueVariableNames(nodes: MaterialNode[]) {
  const result: Record<string, string> = {}
  const used = new Set<string>()
  for (const node of nodes) {
    const base = `node_${node.id.replace(/[^A-Za-z0-9_$]/g, '_')}`.replace(
      /^node_(?=\d)/,
      'node_n',
    )
    let candidate = base
    let suffix = 2
    while (used.has(candidate)) candidate = `${base}_${suffix++}`
    used.add(candidate)
    result[node.id] = candidate
  }
  return result
}
