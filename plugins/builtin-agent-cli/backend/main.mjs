import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import path from 'node:path'
import readline from 'node:readline'

const agents = [
  ['claude', 'Claude Code', 'claude', ['openclaude'], 'CLAUDE_BIN', 'stdin'],
  ['openclaw', 'OpenClaw', 'openclaw', [], 'OPENCLAW_BIN', 'argv-message'],
  ['codex', 'OpenAI Codex', 'codex', [], 'CODEX_BIN', 'stdin'],
  ['cursor-agent', 'Cursor Agent', 'cursor-agent', [], 'CURSOR_AGENT_BIN', 'stdin'],
  ['gemini', 'Gemini CLI', 'gemini', [], 'GEMINI_BIN', 'stdin'],
  ['copilot', 'GitHub Copilot CLI', 'copilot', [], 'COPILOT_BIN', 'stdin'],
  ['bob', 'IBM Bob Shell', 'bob', [], 'BOB_BIN', 'stdin'],
  ['opencode', 'OpenCode', 'opencode-cli', ['opencode'], 'OPENCODE_BIN', 'stdin'],
  ['qwen', 'Qwen Coder', 'qwen', [], 'QWEN_BIN', 'stdin'],
  ['qoder', 'Qoder CLI', 'qodercli', [], 'QODER_BIN', 'stdin'],
  ['codewhale', 'CodeWhale', 'codewhale', ['deepseek-tui'], 'CODEWHALE_BIN', 'argv'],
  ['deepseek-tui', 'DeepSeek TUI', 'deepseek-tui', ['codewhale'], 'DEEPSEEK_TUI_BIN', 'argv'],
  ['aider', 'Aider', 'aider', [], 'AIDER_BIN', 'stdin'],
  ['hermes', 'Hermes', 'hermes', [], 'HERMES_BIN', 'acp'],
  ['kimi', 'Kimi CLI', 'kimi', [], 'KIMI_BIN', 'acp'],
  ['devin', 'Devin CLI', 'devin', [], 'DEVIN_BIN', 'acp'],
  ['kiro', 'Kiro CLI', 'kiro-cli', [], 'KIRO_BIN', 'acp'],
  ['kilo', 'Kilo Code', 'kilo', [], 'KILO_BIN', 'acp'],
  ['vibe', 'Mistral Vibe CLI', 'vibe-acp', [], 'VIBE_BIN', 'acp'],
  ['pi', 'Pi CLI', 'pi', [], 'PI_BIN', 'pi-rpc'],
].map(([id, label, bin, fallbackBins, envOverride, protocol]) => ({
  id,
  label,
  bin,
  fallbackBins,
  envOverride,
  protocol,
}))

const active = new Map()
const lines = readline.createInterface({ input: process.stdin, crlfDelay: Infinity })

function send(value) {
  process.stdout.write(`${JSON.stringify(value)}\n`)
}

function respond(id, result) {
  send({ jsonrpc: '2.0', id, result: result ?? null })
}

function fail(id, error) {
  send({
    jsonrpc: '2.0',
    id,
    error: {
      code: error?.code ?? 'AGENT_EXECUTION_FAILED',
      message: error instanceof Error ? error.message : String(error),
      retryable: false,
    },
  })
}

function emit(executionId, type, data) {
  send({
    jsonrpc: '2.0',
    method: 'execution.event',
    params: { executionId, type, data },
  })
}

lines.on('line', (line) => {
  void handle(JSON.parse(line)).catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`)
  })
})

async function handle(request) {
  try {
    if (request.method === 'plugin.initialize') return respond(request.id, { ready: true })
    if (request.method === 'plugin.activate') return respond(request.id, { active: true })
    if (request.method === 'plugin.health') {
      return respond(request.id, {
        ok: true,
        activeExecutions: active.size,
        agents: detectAgents(),
      })
    }
    if (request.method === 'plugin.deactivate') return respond(request.id, { active: false })
    if (request.method === 'plugin.dispose') {
      for (const child of active.values()) child.kill('SIGTERM')
      respond(request.id, { disposed: true })
      setTimeout(() => process.exit(0), 0)
      return
    }
    if (request.method === 'execution.cancel' || request.method === 'agent.cancel') {
      const child = active.get(request.params?.executionId)
      if (child) child.kill('SIGTERM')
      return respond(request.id, { cancelled: Boolean(child) })
    }
    if (request.method === 'agent.describe') return respond(request.id, { agents: detectAgents() })
    if (request.method === 'agent.execute') {
      return respond(request.id, await executeAgent({
        executionId: request.params?.executionId,
        agentId: request.params?.contributionId,
        ...(request.params?.input ?? {}),
      }))
    }
    if (request.method === 'command.execute') {
      const input = request.params?.input ?? {}
      return respond(request.id, await executeAgent({
        executionId: request.params?.executionId,
        ...input,
      }))
    }
    throw Object.assign(new Error(`unknown method: ${request.method}`), { code: 'METHOD_NOT_FOUND' })
  } catch (error) {
    fail(request.id, error)
  }
}

function executeAgent({ executionId, agentId, prompt, model, cwd, env, binPath }) {
  const definition = agents.find((agent) => agent.id === agentId)
  if (!definition) throw new Error(`unknown agent: ${String(agentId)}`)
  if (definition.protocol === 'acp' || definition.protocol === 'pi-rpc') {
    throw new Error(`${definition.label} is detectable but ${definition.protocol} execution is not implemented`)
  }
  const bin = binPath ? resolveOnPath(binPath) : resolveAgentBin(definition)
  if (!bin) throw new Error(`${definition.label} is not installed or is not on PATH`)
  let argv = buildArgv(agentId, model)
  if (definition.protocol === 'argv') argv = [...argv, prompt]
  if (definition.protocol === 'argv-message') argv = [...argv, '--message', prompt]

  return new Promise((resolveExecution, rejectExecution) => {
    const child = spawn(bin, argv, {
      cwd: cwd ?? process.cwd(),
      env: { ...process.env, ...agentEnv(agentId), ...env },
      stdio: ['pipe', 'pipe', 'pipe'],
      shell: process.platform === 'win32',
    })
    active.set(executionId, child)
    emit(executionId, 'progress', { phase: 'spawned', agentId, bin, argv })

    if (definition.protocol !== 'argv' && definition.protocol !== 'argv-message') child.stdin.write(prompt)
    child.stdin.end()

    let stdoutBuffer = ''
    let output = ''
    child.stdout.setEncoding('utf8')
    child.stdout.on('data', (chunk) => {
      if (agentId === 'openclaw') {
        stdoutBuffer += chunk
        return
      }
      stdoutBuffer += chunk
      stdoutBuffer = parseOutputChunk(agentId, stdoutBuffer, (text) => {
        output += text
        emit(executionId, 'delta', { text })
      })
    })
    child.stderr.setEncoding('utf8')
    child.stderr.on('data', (text) => emit(executionId, 'stderr', { text }))
    child.on('error', rejectExecution)
    child.on('close', (exitCode, signal) => {
      active.delete(executionId)
      if (agentId === 'openclaw' && stdoutBuffer.trim()) {
        const text = parseOpenClawOutput(stdoutBuffer)
        if (text) {
          output += text
          emit(executionId, 'delta', { text })
        }
      } else if (stdoutBuffer.trim()) {
        output += stdoutBuffer
        emit(executionId, 'delta', { text: stdoutBuffer })
      }
      if (exitCode !== 0) {
        const error = new Error(
          signal
            ? `${definition.label} terminated by ${signal}`
            : `${definition.label} exited with code ${String(exitCode)}`,
        )
        error.code = 'AGENT_EXIT_FAILED'
        rejectExecution(error)
        return
      }
      resolveExecution({ exitCode, signal, output: output.trim() })
    })
  })
}

function detectAgents() {
  return agents.map((agent) => {
    const binPath = resolveAgentBin(agent)
    return {
      id: agent.id,
      label: agent.label,
      protocol: agent.protocol,
      available: Boolean(binPath),
      invokable: Boolean(binPath) && agent.protocol !== 'acp' && agent.protocol !== 'pi-rpc',
      binPath,
    }
  })
}

function resolveAgentBin(agent) {
  if (process.env[agent.envOverride]) {
    const overridden = resolveOnPath(process.env[agent.envOverride])
    if (overridden) return overridden
  }
  for (const candidate of [agent.bin, ...agent.fallbackBins]) {
    const found = resolveOnPath(candidate)
    if (found) return found
  }
  return null
}

function resolveOnPath(bin) {
  if (!bin) return null
  if (path.isAbsolute(bin)) return existsSync(bin) ? bin : null
  for (const directory of searchPath()) {
    const candidate = path.join(directory, bin)
    if (existsSync(candidate)) return candidate
  }
  return null
}

function searchPath() {
  const directories = new Set((process.env.PATH ?? '').split(path.delimiter).filter(Boolean))
  for (const value of [
    '~/.local/bin', '~/.vite-plus/bin', '~/.opencode/bin', '~/.bun/bin', '~/.volta/bin',
    '~/.asdf/shims', '~/Library/pnpm', '~/.cargo/bin', '~/.npm-global/bin',
    '~/.npm-packages/bin', '~/.claude/local', '~/.nvm/current/bin',
    '/opt/homebrew/bin', '/usr/local/bin',
  ]) {
    directories.add(value.startsWith('~/') ? path.join(homedir(), value.slice(2)) : value)
  }
  return [...directories]
}

function buildArgv(agentId, model) {
  const modelArgs = model && model !== 'default' ? ['--model', model] : []
  const argv = {
    claude: ['-p', '--output-format', 'stream-json', '--verbose', '--permission-mode', 'bypassPermissions', ...modelArgs],
    openclaw: ['agent', '--local', '--json', '--agent', 'main', ...modelArgs],
    codex: ['exec', '--json', '--skip-git-repo-check', '--sandbox', 'workspace-write', '-c', 'sandbox_workspace_write.network_access=true', ...modelArgs],
    'cursor-agent': ['--print', '--output-format', 'stream-json', '--stream-partial-output', '--force', '--trust', ...modelArgs],
    gemini: ['--output-format', 'stream-json', '--yolo', ...modelArgs],
    copilot: ['--allow-all-tools', '--output-format', 'json', ...modelArgs],
    bob: ['--output-format', 'stream-json', '--hide-intermediary-output'],
    opencode: ['run', '--format', 'json', '--dangerously-skip-permissions', ...modelArgs, '-'],
    qwen: ['--yolo', ...modelArgs, '-'],
    qoder: ['-p', '--output-format', 'stream-json', '--yolo', ...modelArgs],
    codewhale: ['exec', '--auto', ...modelArgs],
    'deepseek-tui': ['exec', '--auto', ...modelArgs],
    aider: ['--no-pretty', '--no-stream', '--yes-always', '--message-file', '-', ...modelArgs],
  }[agentId]
  if (!argv) throw new Error(`unsupported agent: ${agentId}`)
  return argv
}

function agentEnv(agentId) {
  return agentId === 'gemini' ? { GEMINI_CLI_TRUST_WORKSPACE: 'true' } : {}
}

function parseOutputChunk(agentId, buffer, emitText) {
  let rest = buffer
  let newline
  while ((newline = rest.indexOf('\n')) !== -1) {
    const line = rest.slice(0, newline).trim()
    rest = rest.slice(newline + 1)
    if (!line) continue
    try {
      const text = extractText(JSON.parse(line))
      if (text) emitText(text)
    } catch {
      if (['aider', 'codewhale', 'deepseek-tui'].includes(agentId)) emitText(`${line}\n`)
    }
  }
  return rest
}

function extractText(value) {
  const parts = []
  const visit = (item, key = '') => {
    if (item == null) return
    if (typeof item === 'string') {
      if (['text', 'content', 'delta', 'response', 'result', 'message', 'output', 'finalAssistantVisibleText'].includes(key) && item.trim()) {
        parts.push(item)
      }
      return
    }
    if (Array.isArray(item)) return item.forEach((child) => visit(child))
    if (typeof item === 'object') {
      if (item.type === 'text' && typeof item.text === 'string') parts.push(item.text)
      if (item.type === 'content_block_delta' && typeof item.delta?.text === 'string') parts.push(item.delta.text)
      if (item.type === 'response.output_text.delta' && typeof item.delta === 'string') parts.push(item.delta)
      for (const [childKey, child] of Object.entries(item)) visit(child, childKey)
    }
  }
  visit(value)
  return parts.join('')
}

function parseOpenClawOutput(value) {
  try {
    const object = JSON.parse(value)
    return object?.meta?.finalAssistantVisibleText
      ?? object?.meta?.finalAssistantRawText
      ?? object?.payloads?.[0]?.text
      ?? ''
  } catch {
    return value
  }
}
