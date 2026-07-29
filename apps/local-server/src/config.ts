import { delimiter, dirname, join, resolve } from 'node:path'
import { homedir } from 'node:os'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'

export type LocalServerOptions = {
  preferredPort?: number
  dataDir?: string
  webDistDir?: string
  pluginDirs?: string[]
  cwd?: string
  runtimeFilePath?: string
  rvfCliCommand?: string
  webMode?: 'static' | 'vite' | 'none'
  viteRoot?: string
  distribution?: 'source' | 'electron'
}

export type LocalServerConfig = {
  preferredPort: number
  host: string
  dataDir: string
  distDir: string
  workspaceRoot: string
  cwd: string
  rvfCliCommand: string
  runtimeFilePath: string
  webMode: 'static' | 'vite' | 'none'
  viteRoot: string
  distribution: 'source' | 'electron'
  runTimeoutMs: number
  runReaperIntervalMs: number
  visualTaskIntervalMs: number
  visualTaskBatchSize: number
  visualTaskImageTimeoutMs: number
  visualTaskVideoTimeoutMs: number
  visualTaskLeaseDurationMs: number
  pluginRequestTimeoutMs: number
  pluginShutdownGraceMs: number
  pluginDirs: string[]
}

const sourceDir = dirname(fileURLToPath(import.meta.url))
const appDir = join(sourceDir, '..')
const defaultWorkspaceRoot = resolve(appDir, '../..')

export function resolveLocalServerConfig(
  options: LocalServerOptions = {},
  env: NodeJS.ProcessEnv = process.env,
): LocalServerConfig {
  const workspaceRoot = defaultWorkspaceRoot
  const configuredPluginDirs = env.RED_VIDEO_FLOW_PLUGIN_DIRS
    ?.split(delimiter)
    .map((item) => item.trim())
    .filter(Boolean)
  const pluginDirs = options.pluginDirs
    ?? configuredPluginDirs
    ?? [
      resolve(options.cwd ?? process.cwd(), '.red-video-flow/plugins'),
      resolve(homedir(), '.red-video-flow/plugins'),
      resolve(workspaceRoot, 'plugins'),
    ]

  return {
    preferredPort: options.preferredPort
      ?? readNumber(env.RED_VIDEO_FLOW_AGENT_PORT ?? env.RED_VEDIO_FLOW_AGENT_PORT, 5176, 'agent port'),
    host: '127.0.0.1',
    dataDir: resolve(options.dataDir ?? env.RED_VIDEO_FLOW_DATA_DIR ?? join(appDir, '.data')),
    distDir: resolve(options.webDistDir ?? env.RED_VIDEO_FLOW_WEB_DIST_DIR ?? join(appDir, '../web/dist')),
    workspaceRoot,
    cwd: resolve(options.cwd ?? process.cwd()),
    rvfCliCommand: options.rvfCliCommand
      ?? env.RVF_CLI_COMMAND
      ?? sourceRvfCliCommand(workspaceRoot),
    runtimeFilePath: resolve(
      options.runtimeFilePath
        ?? env.RED_VIDEO_FLOW_RUNTIME_FILE
        ?? join(homedir(), '.red-video-flow/runtime.json'),
    ),
    webMode: options.webMode ?? readWebMode(env.RED_VIDEO_FLOW_WEB_MODE),
    viteRoot: resolve(options.viteRoot ?? env.RED_VIDEO_FLOW_VITE_ROOT ?? join(workspaceRoot, 'apps/web')),
    distribution: options.distribution ?? 'source',
    runTimeoutMs: readNumber(env.RED_VIDEO_FLOW_RUN_TIMEOUT_MS, 120_000, 'run timeout'),
    runReaperIntervalMs: readNumber(env.RED_VIDEO_FLOW_RUN_REAPER_INTERVAL_MS, 30_000, 'run reaper interval'),
    visualTaskIntervalMs: readNumber(env.RED_VIDEO_FLOW_VISUAL_TASK_INTERVAL_MS, 5_000, 'visual task interval'),
    visualTaskBatchSize: readNumber(env.RED_VIDEO_FLOW_VISUAL_TASK_BATCH_SIZE, 4, 'visual task batch size'),
    visualTaskImageTimeoutMs: readNumber(env.RED_VIDEO_FLOW_VISUAL_TASK_IMAGE_TIMEOUT_MS, 10 * 60_000, 'image timeout'),
    visualTaskVideoTimeoutMs: readNumber(env.RED_VIDEO_FLOW_VISUAL_TASK_VIDEO_TIMEOUT_MS, 30 * 60_000, 'video timeout'),
    visualTaskLeaseDurationMs: readNumber(env.RED_VIDEO_FLOW_VISUAL_TASK_LEASE_DURATION_MS, 60_000, 'visual task lease'),
    pluginRequestTimeoutMs: readNumber(env.RED_VIDEO_FLOW_PLUGIN_REQUEST_TIMEOUT_MS, 30_000, 'plugin request timeout'),
    pluginShutdownGraceMs: readNumber(env.RED_VIDEO_FLOW_PLUGIN_SHUTDOWN_GRACE_MS, 3_000, 'plugin shutdown grace'),
    pluginDirs: pluginDirs.map((item) => resolve(item)),
  }
}

function sourceRvfCliCommand(workspaceRoot: string) {
  const tsxPackagePath = createRequire(import.meta.url).resolve('tsx/package.json')
  const tsxCliPath = join(dirname(tsxPackagePath), 'dist/cli.mjs')
  const rvfEntryPath = join(workspaceRoot, 'packages/workflow-cli/src/index.ts')
  return [process.execPath, tsxCliPath, rvfEntryPath].map(shellQuote).join(' ')
}

function shellQuote(value: string) {
  if (process.platform === 'win32') return `"${value.replaceAll('"', '""')}"`
  return `'${value.replaceAll("'", "'\\''")}'`
}

function readWebMode(value: string | undefined): LocalServerConfig['webMode'] {
  if (value === undefined) return 'static'
  if (value === 'static' || value === 'vite' || value === 'none') return value
  throw new Error(`invalid web mode: ${value}`)
}

function readNumber(value: string | undefined, fallback: number, label: string) {
  if (value === undefined) return fallback
  const number = Number(value)
  if (!Number.isFinite(number) || number < 0) throw new Error(`invalid ${label}: ${value}`)
  return number
}
