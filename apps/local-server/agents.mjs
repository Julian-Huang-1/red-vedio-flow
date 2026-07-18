import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import path from 'node:path'

export const DEFAULT_MODEL = { id: 'default', label: 'Default (CLI config)' }

export const AGENTS = [
  {
    id: 'claude',
    label: 'Claude Code',
    bin: 'claude',
    fallbackBins: ['openclaude'],
    envOverride: 'CLAUDE_BIN',
    vendor: 'Anthropic',
    protocol: 'stdin',
    fallbackModels: [DEFAULT_MODEL, { id: 'sonnet', label: 'Sonnet' }, { id: 'opus', label: 'Opus' }],
  },
  {
    id: 'openclaw',
    label: 'OpenClaw',
    bin: 'openclaw',
    envOverride: 'OPENCLAW_BIN',
    vendor: 'OpenClaw',
    protocol: 'argv-message',
    fallbackModels: [DEFAULT_MODEL],
  },
  {
    id: 'codex',
    label: 'OpenAI Codex',
    bin: 'codex',
    envOverride: 'CODEX_BIN',
    vendor: 'OpenAI',
    protocol: 'stdin',
    fallbackModels: [DEFAULT_MODEL, { id: 'gpt-5', label: 'gpt-5' }, { id: 'gpt-5-codex', label: 'gpt-5-codex' }],
  },
  {
    id: 'cursor-agent',
    label: 'Cursor Agent',
    bin: 'cursor-agent',
    envOverride: 'CURSOR_AGENT_BIN',
    vendor: 'Cursor',
    protocol: 'stdin',
    fallbackModels: [DEFAULT_MODEL, { id: 'auto', label: 'auto' }, { id: 'gpt-5', label: 'gpt-5' }],
  },
  {
    id: 'gemini',
    label: 'Gemini CLI',
    bin: 'gemini',
    envOverride: 'GEMINI_BIN',
    vendor: 'Google',
    protocol: 'stdin',
    fallbackModels: [DEFAULT_MODEL, { id: 'gemini-2.5-pro', label: 'gemini-2.5-pro' }],
  },
  {
    id: 'copilot',
    label: 'GitHub Copilot CLI',
    bin: 'copilot',
    envOverride: 'COPILOT_BIN',
    vendor: 'GitHub',
    protocol: 'stdin',
    fallbackModels: [DEFAULT_MODEL],
  },
  {
    id: 'bob',
    label: 'IBM Bob Shell',
    bin: 'bob',
    envOverride: 'BOB_BIN',
    vendor: 'IBM',
    protocol: 'stdin',
    fallbackModels: [DEFAULT_MODEL],
  },
  {
    id: 'opencode',
    label: 'OpenCode',
    bin: 'opencode-cli',
    fallbackBins: ['opencode'],
    envOverride: 'OPENCODE_BIN',
    vendor: 'Open',
    protocol: 'stdin',
    fallbackModels: [DEFAULT_MODEL],
  },
  {
    id: 'qwen',
    label: 'Qwen Coder',
    bin: 'qwen',
    envOverride: 'QWEN_BIN',
    vendor: 'Alibaba',
    protocol: 'stdin',
    fallbackModels: [DEFAULT_MODEL],
  },
  {
    id: 'qoder',
    label: 'Qoder CLI',
    bin: 'qodercli',
    envOverride: 'QODER_BIN',
    vendor: 'Qoder',
    protocol: 'stdin',
    fallbackModels: [DEFAULT_MODEL],
  },
  {
    id: 'codewhale',
    label: 'CodeWhale',
    bin: 'codewhale',
    fallbackBins: ['deepseek-tui'],
    envOverride: 'CODEWHALE_BIN',
    vendor: 'CodeWhale',
    protocol: 'argv',
    fallbackModels: [DEFAULT_MODEL],
  },
  {
    id: 'deepseek-tui',
    label: 'DeepSeek TUI',
    bin: 'deepseek-tui',
    fallbackBins: ['codewhale'],
    envOverride: 'DEEPSEEK_TUI_BIN',
    vendor: 'DeepSeek',
    protocol: 'argv',
    fallbackModels: [DEFAULT_MODEL],
  },
  {
    id: 'aider',
    label: 'Aider',
    bin: 'aider',
    envOverride: 'AIDER_BIN',
    vendor: 'Aider',
    protocol: 'stdin',
    fallbackModels: [DEFAULT_MODEL],
  },
  { id: 'hermes', label: 'Hermes', bin: 'hermes', envOverride: 'HERMES_BIN', vendor: 'Mature', protocol: 'acp', fallbackModels: [DEFAULT_MODEL] },
  { id: 'kimi', label: 'Kimi CLI', bin: 'kimi', envOverride: 'KIMI_BIN', vendor: 'Moonshot', protocol: 'acp', fallbackModels: [DEFAULT_MODEL] },
  { id: 'devin', label: 'Devin CLI', bin: 'devin', envOverride: 'DEVIN_BIN', vendor: 'Cognition', protocol: 'acp', fallbackModels: [DEFAULT_MODEL] },
  { id: 'kiro', label: 'Kiro CLI', bin: 'kiro-cli', envOverride: 'KIRO_BIN', vendor: 'AWS', protocol: 'acp', fallbackModels: [DEFAULT_MODEL] },
  { id: 'kilo', label: 'Kilo Code', bin: 'kilo', envOverride: 'KILO_BIN', vendor: 'Kilo', protocol: 'acp', fallbackModels: [DEFAULT_MODEL] },
  { id: 'vibe', label: 'Mistral Vibe CLI', bin: 'vibe-acp', envOverride: 'VIBE_BIN', vendor: 'Mistral', protocol: 'acp', fallbackModels: [DEFAULT_MODEL] },
  { id: 'pi', label: 'Pi CLI', bin: 'pi', envOverride: 'PI_BIN', vendor: 'Inflection', protocol: 'pi-rpc', fallbackModels: [DEFAULT_MODEL] },
]

const extraPathDirs = [
  '~/.local/bin',
  '~/.vite-plus/bin',
  '~/.opencode/bin',
  '~/.bun/bin',
  '~/.volta/bin',
  '~/.asdf/shims',
  '~/Library/pnpm',
  '~/.cargo/bin',
  '~/.npm-global/bin',
  '~/.npm-packages/bin',
  '~/.claude/local',
  '~/.nvm/current/bin',
  '/opt/homebrew/bin',
  '/usr/local/bin',
]

function expandHome(value) {
  return value.startsWith('~/') ? path.join(homedir(), value.slice(2)) : value
}

export function getSearchPath() {
  const dirs = new Set((process.env.PATH ?? '').split(path.delimiter).filter(Boolean))
  if (process.env.VP_HOME) dirs.add(path.join(process.env.VP_HOME, 'bin'))
  if (process.env.NPM_CONFIG_PREFIX) {
    dirs.add(path.join(process.env.NPM_CONFIG_PREFIX, 'bin'))
    dirs.add(process.env.NPM_CONFIG_PREFIX)
  }
  for (const dir of extraPathDirs.map(expandHome)) dirs.add(dir)
  return [...dirs]
}

export function resolveOnPath(bin) {
  if (!bin) return null
  if (path.isAbsolute(bin)) return existsSync(bin) ? bin : null
  for (const dir of getSearchPath()) {
    const candidate = path.join(dir, bin)
    if (existsSync(candidate)) return candidate
  }
  return null
}

export function resolveAgentBin(def) {
  if (def.envOverride && process.env[def.envOverride]) {
    const fromEnv = resolveOnPath(process.env[def.envOverride])
    if (fromEnv) return fromEnv
  }
  for (const candidate of [def.bin, ...(def.fallbackBins ?? [])]) {
    const found = resolveOnPath(candidate)
    if (found) return found
  }
  return null
}

export function detectAgents() {
  return AGENTS.map((agent) => {
    const binPath = resolveAgentBin(agent)
    return {
      ...agent,
      available: Boolean(binPath),
      binPath,
      invokable: Boolean(binPath) && agent.protocol !== 'acp' && agent.protocol !== 'pi-rpc',
    }
  })
}

export function buildArgv(agentId, opts = {}) {
  const modelArgs = opts.model && opts.model !== 'default' ? ['--model', opts.model] : []

  switch (agentId) {
    case 'claude':
      return ['-p', '--output-format', 'stream-json', '--verbose', '--permission-mode', 'bypassPermissions', ...modelArgs]
    case 'openclaw':
      return ['agent', '--local', '--json', '--agent', 'main', ...modelArgs]
    case 'codex':
      return ['exec', '--json', '--skip-git-repo-check', '--sandbox', 'workspace-write', '-c', 'sandbox_workspace_write.network_access=true', ...modelArgs]
    case 'cursor-agent':
      return ['--print', '--output-format', 'stream-json', '--stream-partial-output', '--force', '--trust', ...modelArgs]
    case 'gemini':
      return ['--output-format', 'stream-json', '--yolo', ...modelArgs]
    case 'copilot':
      return ['--allow-all-tools', '--output-format', 'json', ...modelArgs]
    case 'bob':
      return ['--output-format', 'stream-json', '--hide-intermediary-output']
    case 'opencode':
      return ['run', '--format', 'json', '--dangerously-skip-permissions', ...modelArgs, '-']
    case 'qwen':
      return ['--yolo', ...modelArgs, '-']
    case 'qoder':
      return ['-p', '--output-format', 'stream-json', '--yolo', ...modelArgs]
    case 'codewhale':
    case 'deepseek-tui':
      return ['exec', '--auto', ...modelArgs]
    case 'aider':
      return ['--no-pretty', '--no-stream', '--yes-always', '--message-file', '-', ...modelArgs]
    default:
      throw new Error(`Unsupported agent: ${agentId}`)
  }
}

export function envFor(agentId) {
  const env = { ...process.env }
  if (agentId === 'gemini') env.GEMINI_CLI_TRUST_WORKSPACE = 'true'
  return env
}
