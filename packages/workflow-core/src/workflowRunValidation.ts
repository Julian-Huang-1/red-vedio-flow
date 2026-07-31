import { validateWorkflowGraph } from './executionPlan'
import type { MaterialNode, WorkflowDocument } from './types'

export type WorkflowRunValidationIssue = {
  phase: 'graph' | 'node' | 'input'
  severity: 'error' | 'warning'
  code: string
  message: string
  nodeId?: string
  edgeId?: string
  field?: string
}

export type WorkflowRunValidationResult = {
  valid: boolean
  issues: WorkflowRunValidationIssue[]
}

export function validateWorkflowForRun(
  workflow: WorkflowDocument,
  inputs: Record<string, unknown> = {},
): WorkflowRunValidationResult {
  const issues: WorkflowRunValidationIssue[] = validateWorkflowGraph(workflow.graph)
    .map((issue) => ({
      phase: 'graph',
      severity: 'error',
      code: issue.code,
      message: issue.message,
      nodeId: issue.nodeIds?.[0],
      edgeId: issue.edgeIds?.[0],
    }))

  const inputKeys = new Map<string, string>()
  const incomingNodeIds = new Set(workflow.graph.edges.map((edge) => edge.target))

  for (const node of workflow.graph.nodes) {
    if (isInputNode(node)) {
      validateInputNode(node, inputs, inputKeys, issues)
      continue
    }
    validateGenerateNode(node, incomingNodeIds.has(node.id), issues)
  }

  return {
    valid: !issues.some((issue) => issue.severity === 'error'),
    issues,
  }
}

function validateInputNode(
  node: MaterialNode,
  inputs: Record<string, unknown>,
  inputKeys: Map<string, string>,
  issues: WorkflowRunValidationIssue[],
) {
  const field = node.data.workflowInput
  if (!field) {
    if (node.data.serviceRole === 'input' && node.data.serviceLabel?.trim()) return
    issues.push(nodeIssue(node, 'workflow_input_missing', '输入节点缺少字段定义', 'workflowInput'))
    return
  }
  const key = field.key.trim()
  if (!key) {
    issues.push(nodeIssue(node, 'workflow_input_key_missing', '输入节点的字段名称不能为空', 'workflowInput.key'))
    return
  }
  const previousNodeId = inputKeys.get(key)
  if (previousNodeId) {
    issues.push(nodeIssue(node, 'workflow_input_key_duplicate', `输入字段名称重复：${key}`, 'workflowInput.key'))
  } else {
    inputKeys.set(key, node.id)
  }
  if (field.required && !(key in inputs) && field.defaultValue === undefined) {
    issues.push({
      ...nodeIssue(node, 'workflow_input_required', `缺少必填输入：${field.title || key}`, `inputs.${key}`),
      phase: 'input',
    })
  }
}

function validateGenerateNode(
  node: MaterialNode,
  hasUpstream: boolean,
  issues: WorkflowRunValidationIssue[],
) {
  const composer = node.data.composer
  if (!composer || typeof composer !== 'object') {
    if (node.data.serviceRole === 'output' && hasUpstream) return
    issues.push(nodeIssue(node, 'composer_missing', '节点缺少 Composer 配置', 'composer'))
    return
  }
  if (!composer.model?.providerId?.trim()) {
    issues.push(nodeIssue(node, 'composer_provider_missing', 'Composer 未选择 Provider', 'composer.model.providerId'))
  }
  if (!composer.model?.modelId?.trim()) {
    issues.push(nodeIssue(node, 'composer_model_missing', 'Composer 未选择模型', 'composer.model.modelId'))
  }
  const expectedConfigType = {
    text: 'openai-text',
    image: 'openai-image',
    video: 'volc-video',
  }[node.data.materialType]
  if (!composer.generationConfig?.type) {
    issues.push(nodeIssue(node, 'composer_generation_config_missing', 'Composer 缺少生成参数', 'composer.generationConfig'))
  } else if (composer.generationConfig.type !== expectedConfigType) {
    issues.push(nodeIssue(
      node,
      'composer_generation_config_mismatch',
      `生成参数与${materialLabel(node)}节点类型不匹配`,
      'composer.generationConfig.type',
    ))
  }
  if (!Array.isArray(composer.attachments)) {
    issues.push(nodeIssue(node, 'composer_attachments_invalid', 'Composer 附件格式无效', 'composer.attachments'))
  }
  const hasPrompt = typeof composer.prompt === 'string' && Boolean(composer.prompt.trim())
  const hasAttachments = Array.isArray(composer.attachments) && composer.attachments.length > 0
  if (!hasPrompt && !hasAttachments && !hasUpstream) {
    issues.push(nodeIssue(
      node,
      'node_input_empty',
      `${materialLabel(node)}节点没有提示词、附件或上游输入`,
      'composer.prompt',
    ))
  }
}

function nodeIssue(
  node: MaterialNode,
  code: string,
  message: string,
  field?: string,
): WorkflowRunValidationIssue {
  return {
    phase: 'node',
    severity: 'error',
    code,
    message,
    nodeId: node.id,
    field,
  }
}

function materialLabel(node: MaterialNode) {
  return node.data.materialType === 'text'
    ? '文本'
    : node.data.materialType === 'image'
      ? '图片'
      : '视频'
}

function isInputNode(node: MaterialNode) {
  return node.data.executionMode === 'input'
    || node.data.serviceRole === 'input'
    || Boolean(node.data.workflowInput)
}
