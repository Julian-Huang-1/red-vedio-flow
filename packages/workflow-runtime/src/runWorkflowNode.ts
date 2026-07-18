import {
  createGeneratedValue,
  summarizeNode,
  type LocalAgent,
  type MaterialNode,
  type MaterialValue,
  type NodeStatus,
  type WorkflowEdge,
} from '@red-video-flow/workflow-core'

export type VisualRunResult = {
  submitId?: string
  url?: string
  localPath?: string
  fileName?: string
  mimeType?: string
  text?: string
}

export type RunWorkflowNodeInput = {
  node: MaterialNode
  upstream: MaterialNode[]
  edges: WorkflowEdge[]
  prompt: string
  selectedAgent?: LocalAgent
  workflowId?: string
  workflowRevision?: number
  baseUrl?: string
}

export type WorkflowRuntimeAdapters = {
  runTextAgent: (input: {
    agentId: string
    node: MaterialNode
    upstream: MaterialNode[]
    edges: WorkflowEdge[]
    prompt: string
    workflowId?: string
    workflowRevision?: number
    baseUrl?: string
  }) => Promise<string>
  runVisualModel: (input: {
    node: MaterialNode
    upstream: MaterialNode[]
    edges: WorkflowEdge[]
    prompt: string
  }) => Promise<VisualRunResult>
}

export type RunWorkflowNodeResult = {
  status: NodeStatus
  value: MaterialValue
  assistantMessage: string
}

export function fallbackGenerate(prompt: string, upstream: MaterialNode[]) {
  const upstreamSummary = upstream.map(summarizeNode).join('\n')
  return upstreamSummary
    ? [`根据当前指令生成：${prompt}`, `参考上游素材：\n${upstreamSummary}`].join('\n\n')
    : `根据当前指令生成：${prompt}`
}

export async function runWorkflowNode(
  input: RunWorkflowNodeInput,
  adapters: WorkflowRuntimeAdapters,
): Promise<RunWorkflowNodeResult> {
  const { node, upstream, edges, prompt, selectedAgent, workflowId, workflowRevision, baseUrl } = input

  try {
    if (node.data.materialType === 'image' || node.data.materialType === 'video') {
      const result = await adapters.runVisualModel({ node, upstream, edges, prompt })
      const resultText = result.text || `已提交即梦生成任务${result.submitId ? `：${result.submitId}` : ''}`

      return {
        status: result.url ? 'done' : 'running',
        value: {
          ...node.data.value,
          text: result.url ? undefined : resultText,
          url: result.url,
          localPath: result.localPath,
          fileName: result.fileName,
          mimeType: result.mimeType,
          submitId: result.submitId,
          provider: 'dreamina',
        },
        assistantMessage: result.url ? '已通过即梦生成视觉素材。' : resultText,
      }
    }

    const resultText = selectedAgent
      ? await adapters.runTextAgent({
          agentId: selectedAgent.id,
          node,
          upstream,
          edges,
          prompt,
          workflowId,
          workflowRevision,
          baseUrl,
        })
      : fallbackGenerate(prompt, upstream)

    return {
      status: 'done',
      value: createGeneratedValue(node, resultText),
      assistantMessage: selectedAgent ? `已通过 ${selectedAgent.label} 完成生成。` : '已使用本地模拟结果完成生成。',
    }
  } catch (error) {
    const resultText = [
      fallbackGenerate(prompt, upstream),
      '',
      `本地 Agent 调用失败：${error instanceof Error ? error.message : String(error)}`,
    ].join('\n')

    return {
      status: 'done',
      value: createGeneratedValue(node, resultText),
      assistantMessage: '已使用本地模拟结果完成生成。',
    }
  }
}
