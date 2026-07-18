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
  onEvent: (event: AgentEvent) => void
}

export function buildNodePrompt({ nodeKind, prompt, upstream = [], currentNode }: any) {
  const upstreamText = upstream.length
    ? upstream
        .map((node: any, index: number) => {
          const value = node?.data?.value ?? node?.value ?? {}
          const title = node?.data?.title ?? node?.title ?? `上游节点 ${index + 1}`
          if (value.text) return `- ${title}（文本）:\n${value.text}`
          if (value.fileName || value.url) return `- ${title}（媒体）: ${value.fileName ?? value.url}`
          return `- ${title}: 空素材`
        })
        .join('\n\n')
    : '无上游输入。'

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
    '',
    '请只返回适合作为当前节点产物的结果内容，不要输出解释、Markdown 外壳或代码块。',
  ].join('\n')
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

export function invokeAgent({ agentId, prompt, model, cwd, onEvent }: InvokeAgentInput): ChildProcessWithoutNullStreams {
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
    env: envFor(agentId),
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
