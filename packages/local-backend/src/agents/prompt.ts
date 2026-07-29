export class AgentPromptService {
  buildNodePrompt(input: BuildNodePromptInput) {
    return buildNodePrompt(input)
  }
}

export type BuildNodePromptInput = {
  mode?: 'node' | 'chat'
  nodeKind?: string
  prompt?: string
  messages?: Array<{ role?: string; text?: string }>
  upstream?: unknown[]
  referencedNodes?: unknown[]
  currentNode?: unknown
  workflowId?: string
  workflowRevision?: number
  baseUrl?: string
  rvfCommand?: string
}

export function buildNodePrompt({
  mode = 'node',
  nodeKind,
  prompt,
  messages = [],
  upstream = [],
  referencedNodes = [],
  currentNode,
  workflowId,
  workflowRevision,
  baseUrl,
  rvfCommand,
}: BuildNodePromptInput) {
  const current = asRecord(currentNode)
  const currentData = asRecord(current?.data)
  const upstreamText = summarizeNodes(upstream, '无上游输入。')
  const referencedText = summarizeNodes(referencedNodes, '无引用节点。')
  const conversationText = summarizeConversation(messages)
  const workflowTools = workflowId
    ? [
        '',
        '工作流工具：',
        `- 当前 workflowId: ${workflowId}`,
        `- 当前 nodeId: ${readString(current?.id) ?? 'unknown'}`,
        `- 当前 baseRevision: ${workflowRevision ?? 'unknown'}`,
        `- Workflow API Base URL: ${baseUrl ?? 'http://127.0.0.1:5176'}`,
        `- 使用工作流 CLI 前先运行：${rvfCommand ?? 'rvf'} workflow --help`,
        '- 优先使用 CLI 帮助里的一键运行命令，不要凭记忆拼接旧命令。',
        '- 不要替换历史 messages；只通过 CLI 提供的增量命令追加或写回。',
      ].join('\n')
    : ''

  if (mode === 'chat') {
    return [
      '你是 red-video-flow 的侧边栏 AI 工作流助手。',
      '你可以帮助用户拆解短视频工作流、分析节点、生成创意、编排素材，必要时基于当前选中节点写回结果。',
      current ? `当前选中节点类型：${nodeKind}` : '当前没有选中节点。',
      current ? `当前选中节点标题：${readString(currentData?.title) ?? readString(current.title) ?? '未命名节点'}` : '',
      '',
      '当前选中节点的上游素材：',
      upstreamText,
      '',
      '用户 @ 引用的节点：',
      referencedText,
      '',
      '当前对话历史：',
      conversationText,
      '',
      '用户消息：',
      prompt ?? '',
      workflowTools,
      '',
      '如果没有调用工作流 CLI，请直接回复用户，保持简洁、有执行建议。',
    ].filter(Boolean).join('\n')
  }

  return [
    '你是一个 AI 短剧工作流节点生成器。',
    `当前节点类型：${nodeKind ?? 'unknown'}`,
    `当前节点标题：${readString(currentData?.title) ?? readString(current?.title) ?? '未命名节点'}`,
    '',
    '上游素材：',
    upstreamText,
    '',
    '用户给 AI 的指令：',
    prompt ?? '',
    workflowTools,
    '',
    '如果你只是被外层节点运行器调用，请只返回适合作为当前节点产物的结果内容，不要输出解释、Markdown 外壳或代码块。',
  ].join('\n')
}

function summarizeNodes(nodes: unknown[], emptyText: string) {
  if (!nodes.length) return emptyText
  return nodes.map((item, index) => {
    const node = asRecord(item)
    const data = asRecord(node?.data)
    const value = asRecord(data?.value) ?? asRecord(node?.value)
    const title = readString(data?.title) ?? readString(node?.title) ?? `节点 ${index + 1}`
    const text = readString(value?.text)
    if (text) return `- ${title}（文本）:\n${text}`
    const fileName = readString(value?.fileName)
    const url = readString(value?.url)
    if (fileName || url) return `- ${title}（媒体）: ${fileName ?? url}`
    return `- ${title}: 空素材`
  }).join('\n\n')
}

function summarizeConversation(messages: Array<{ role?: string; text?: string }>) {
  const recentMessages = messages
    .filter((message) => message.text?.trim())
    .slice(-12)
  if (!recentMessages.length) return '无历史对话。'
  return recentMessages
    .map((message) => `${message.role === 'assistant' ? '助手' : '用户'}：${message.text}`)
    .join('\n\n')
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined
}

function readString(value: unknown) {
  return typeof value === 'string' && value ? value : undefined
}
