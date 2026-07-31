import { delimiter, dirname, join, resolve } from 'node:path'
import { homedir } from 'node:os'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'
import { existsSync, readFileSync } from 'node:fs'

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
  maasApiKey?: string
  requireSso?: boolean
  databaseUrl?: string
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
  maasApiKey: string
  textModelBaseUrl: string
  credentialEncryptionKey: string
  requireSso: boolean
  databaseUrl?: string
}

const sourceDir = dirname(fileURLToPath(import.meta.url))
const appDir = join(sourceDir, '..')
const defaultWorkspaceRoot = resolve(appDir, '../..')

export function resolveLocalServerConfig(
  options: LocalServerOptions = {},
  env: NodeJS.ProcessEnv = process.env,
): LocalServerConfig {
  const workspaceRoot = defaultWorkspaceRoot
  const databaseUrl = options.databaseUrl
    ?? env.DATABASE_URL
    ?? readDatabaseUrl(
      env.DB_PROPERTIES_PATH
        ?? env.RED_VIDEO_FLOW_DB_PROPERTIES
        ?? join(process.cwd(), 'db.properties'),
    )
  if (databaseUrl && !env.APP_CREDENTIAL_ENCRYPTION_KEY && !env.RED_VIDEO_FLOW_CREDENTIAL_ENCRYPTION_KEY) {
    throw new Error('APP_CREDENTIAL_ENCRYPTION_KEY is required when PostgreSQL is enabled')
  }
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
      ?? readNumber(env.PORT ?? env.RED_VIDEO_FLOW_AGENT_PORT ?? env.RED_VEDIO_FLOW_AGENT_PORT, 5176, 'agent port'),
    host: env.HOST ?? (databaseUrl ? '0.0.0.0' : '127.0.0.1'),
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
    maasApiKey: options.maasApiKey
      ?? env.RED_VIDEO_FLOW_MAAS_API_KEY
      ?? 'MAASfd018690923149bc890e003129024aee',
    textModelBaseUrl: trimTrailingSlash(
      env.RED_VIDEO_FLOW_TEXT_MODEL_BASE_URL
        ?? 'https://maas.devops.rednote.life/hackson/v1',
    ),
    credentialEncryptionKey: env.APP_CREDENTIAL_ENCRYPTION_KEY
      ?? env.RED_VIDEO_FLOW_CREDENTIAL_ENCRYPTION_KEY
      ?? `local-development:${resolve(options.dataDir ?? env.RED_VIDEO_FLOW_DATA_DIR ?? join(appDir, '.data'))}`,
    requireSso: options.requireSso ?? env.RED_VIDEO_FLOW_REQUIRE_SSO === 'true',
    databaseUrl,
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

function readDatabaseUrl(propertiesPath: string | undefined) {
  if (!propertiesPath || !existsSync(propertiesPath)) return undefined
  const properties = Object.fromEntries(
    readFileSync(propertiesPath, 'utf8')
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith('#'))
      .map((line) => {
        const separator = line.indexOf('=')
        return separator < 0
          ? [line, '']
          : [line.slice(0, separator).trim(), line.slice(separator + 1).trim()]
      }),
  )
  const rawUrl = properties['db.url']
    ?? properties.url
    ?? properties['spring.datasource.url']
  if (!rawUrl) return undefined
  const url = rawUrl.replace(/^jdbc:/, '')
  if (/^postgres(?:ql)?:\/\//.test(url) && !new URL(url).username) {
    const parsed = new URL(url)
    const username = properties['db.username']
      ?? properties.username
      ?? properties['spring.datasource.username']
    const password = properties['db.password']
      ?? properties.password
      ?? properties['spring.datasource.password']
    if (username) parsed.username = username
    if (password) parsed.password = password
    return parsed.toString()
  }
  return url
}

function trimTrailingSlash(value: string) {
  return value.replace(/\/+$/, '')
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
