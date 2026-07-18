import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { AGENTS, buildArgv, envFor, resolveAgentBin } from './registry.js'

export type AgentEvent =
  | { type: 'start'; agentId: string; bin: string; argv: string[] }
  | { type: 'delta'; text: string }
  | { type: 'stderr'; text: string }
  | { type: 'done'; code: number | null; output: string }
  | { type: 'error'; message: string }

export type InvokeAgentInput = {
  agentId: string
  prompt: string
  model?: string
  cwd?: string
  env?: Record<string, string | undefined>
  onEvent: (event: AgentEvent) => void
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
}: any) {
  const summarizeNodes = (nodes: any[], emptyText: string) => nodes.length
    ? nodes
        .map((node: any, index: number) => {
          const value = node?.data?.value ?? node?.value ?? {}
          const title = node?.data?.title ?? node?.title ?? `节点 ${index + 1}`
          if (value.text) return `- ${title}（文本）:\n${value.text}`
          if (value.fileName || value.url) return `- ${title}（媒体）: ${value.fileName ?? value.url}`
          return `- ${title}: 空素材`
        })
        .join('\n\n')
    : emptyText

  const upstreamText = upstream.length
    ? summarizeNodes(upstream, '无上游输入。')
    : '无上游输入。'
  const referencedText = summarizeNodes(referencedNodes, '无引用节点。')
  const conversationText = summarizeConversation(messages)

  const workflowTools = workflowId
    ? [
        '',
        '工作流工具：',
        `- 当前 workflowId: ${workflowId}`,
        `- 当前 nodeId: ${currentNode?.id ?? 'unknown'}`,
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
      currentNode ? `当前选中节点类型：${nodeKind}` : '当前没有选中节点。',
      currentNode ? `当前选中节点标题：${currentNode?.data?.title ?? currentNode?.title ?? '未命名节点'}` : '',
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
      prompt,
      workflowTools,
      '',
      '如果没有调用工作流 CLI，请直接回复用户，保持简洁、有执行建议。',
    ].filter(Boolean).join('\n')
  }

  return [
    '你是一个 AI 短剧工作流节点生成器。',
    `当前节点类型：${nodeKind}`,
    `当前节点标题：${currentNode?.data?.title ?? currentNode?.title ?? '未命名节点'}`,
    '',
    '上游素材：',
    upstreamText,
    '',
    '用户给 AI 的指令：',
    prompt,
    workflowTools,
    '',
    '如果你只是被外层节点运行器调用，请只返回适合作为当前节点产物的结果内容，不要输出解释、Markdown 外壳或代码块。',
  ].join('\n')
}

function summarizeConversation(messages: Array<{ role?: string; text?: string }> = []) {
  const recentMessages = messages
    .filter((message) => message.text?.trim())
    .slice(-12)

  if (!recentMessages.length) return '无历史对话。'
  return recentMessages
    .map((message) => `${message.role === 'assistant' ? '助手' : '用户'}：${message.text}`)
    .join('\n\n')
}

function extractTextFromJson(value: unknown) {
  const parts: string[] = []

  const visit = (item: any, key = '') => {
    if (item == null) return
    if (typeof item === 'string') {
      if (
        ['text', 'content', 'delta', 'response', 'result', 'message', 'output', 'finalAssistantVisibleText'].includes(key) &&
        item.trim()
      ) {
        parts.push(item)
      }
      return
    }
    if (Array.isArray(item)) {
      for (const child of item) visit(child)
      return
    }
    if (typeof item === 'object') {
      if (item.type === 'text' && typeof item.text === 'string') parts.push(item.text)
      if (item.type === 'content_block_delta' && typeof item.delta?.text === 'string') parts.push(item.delta.text)
      if (item.type === 'response.output_text.delta' && typeof item.delta === 'string') parts.push(item.delta)
      if (item.type === 'assistant' && Array.isArray(item.message?.content)) visit(item.message.content)
      for (const [childKey, child] of Object.entries(item)) visit(child, childKey)
    }
  }

  visit(value)
  return parts.join('')
}

function parseOutputChunk(agentId: string, buffer: string, emit: (text: string) => void) {
  let rest = buffer
  let nl
  while ((nl = rest.indexOf('\n')) !== -1) {
    const line = rest.slice(0, nl).trim()
    rest = rest.slice(nl + 1)
    if (!line) continue

    try {
      const parsed = JSON.parse(line)
      const text = extractTextFromJson(parsed)
      if (text) emit(text)
    } catch {
      if (agentId === 'aider' || agentId === 'codewhale' || agentId === 'deepseek-tui') emit(`${line}\n`)
    }
  }
  return rest
}

export function invokeAgent({ agentId, prompt, model, cwd, env, onEvent }: InvokeAgentInput): ChildProcessWithoutNullStreams {
  const def = AGENTS.find((agent) => agent.id === agentId)
  if (!def) throw new Error(`unknown agent: ${agentId}`)
  if (def.protocol === 'acp' || def.protocol === 'pi-rpc') {
    throw new Error(`${def.label} 已检测支持展示，但 ${def.protocol} 协议暂未接入调用。`)
  }

  const bin = resolveAgentBin(def)
  if (!bin) throw new Error(`${def.label} 未安装或不在 PATH 上。`)

  let argv = buildArgv(agentId, { model })
  if (def.protocol === 'argv') argv = [...argv, prompt]
  if (def.protocol === 'argv-message') argv = [...argv, '--message', prompt]

  const child = spawn(bin, argv, {
    cwd: cwd ?? process.cwd(),
    env: { ...envFor(agentId), ...env },
    stdio: ['pipe', 'pipe', 'pipe'],
    shell: process.platform === 'win32',
  })

  onEvent({ type: 'start', agentId, bin, argv })

  if (def.protocol !== 'argv' && def.protocol !== 'argv-message') {
    child.stdin.write(prompt)
  }
  child.stdin.end()

  let stdoutBuffer = ''
  let fullOutput = ''

  child.stdout.setEncoding('utf8')
  child.stdout.on('data', (chunk: string) => {
    if (agentId === 'openclaw') {
      stdoutBuffer += chunk
      return
    }

    stdoutBuffer += chunk
    stdoutBuffer = parseOutputChunk(agentId, stdoutBuffer, (text) => {
      fullOutput += text
      onEvent({ type: 'delta', text })
    })
  })

  child.stderr.setEncoding('utf8')
  child.stderr.on('data', (text: string) => {
    onEvent({ type: 'stderr', text })
  })

  child.on('error', (error) => {
    onEvent({ type: 'error', message: error.message })
  })

  child.on('close', (code) => {
    if (agentId === 'openclaw' && stdoutBuffer.trim()) {
      try {
        const obj = JSON.parse(stdoutBuffer)
        const text = obj?.meta?.finalAssistantVisibleText ?? obj?.meta?.finalAssistantRawText ?? obj?.payloads?.[0]?.text ?? ''
        if (text) {
          fullOutput += text
          onEvent({ type: 'delta', text })
        }
      } catch {
        fullOutput += stdoutBuffer
        onEvent({ type: 'delta', text: stdoutBuffer })
      }
    } else if (stdoutBuffer.trim()) {
      fullOutput += stdoutBuffer
      onEvent({ type: 'delta', text: stdoutBuffer })
    }
    onEvent({ type: 'done', code, output: fullOutput.trim() })
  })

  return child
}
