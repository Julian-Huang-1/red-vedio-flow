import { delimiter, dirname, join, resolve } from 'node:path'
import { homedir } from 'node:os'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'
import { existsSync, readFileSync } from 'node:fs'
import type { PostgresConnectionConfig } from '@red-video-flow/postgres-backend'
import {
  DEFAULT_IMAGE_PROVIDER_URL,
  DEFAULT_TEXT_PROVIDER_URL,
  DEFAULT_VIDEO_PROVIDER_URL,
} from '@red-video-flow/workflow-runtime/network-provider'

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
  database?: PostgresConnectionConfig
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
  workerConcurrency: number
  pluginDirs: string[]
  maasApiKey: string
  textModelBaseUrl: string
  textProviderUrl: string
  imageProviderUrl: string
  videoProviderUrl: string
  credentialEncryptionKey: string
  requireSso: boolean
  database?: PostgresConnectionConfig
  deploymentMode: 'local' | 'cowork'
  runtimePublicOrigin?: string
  runtimeHost?: string
  mainAppOrigin?: string
}

const sourceDir = dirname(fileURLToPath(import.meta.url))
const appDir = join(sourceDir, '..')
const defaultWorkspaceRoot = resolve(appDir, '../..')

export function resolveLocalServerConfig(
  options: LocalServerOptions = {},
  env: NodeJS.ProcessEnv = process.env,
): LocalServerConfig {
  env = withDotEnv(options.cwd ?? process.cwd(), env)
  const workspaceRoot = defaultWorkspaceRoot
  const deploymentMode = env.APP_DEPLOYMENT_MODE === 'cowork' ? 'cowork' : 'local'
  const database = options.database
    ?? readDatabaseProperties(join(process.cwd(), 'db.properties'))
  if (deploymentMode === 'cowork' && !database) {
    throw new Error('Cowork deployment requires db.properties in the application root')
  }
  if (database && !env.APP_CREDENTIAL_ENCRYPTION_KEY && !env.RED_VIDEO_FLOW_CREDENTIAL_ENCRYPTION_KEY) {
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
      ?? readNumber(
        deploymentMode === 'cowork'
          ? env.APP_PORT
          : env.RED_VIDEO_FLOW_AGENT_PORT ?? env.RED_VEDIO_FLOW_AGENT_PORT,
        deploymentMode === 'cowork' ? 3000 : 5176,
        'agent port',
      ),
    host: deploymentMode === 'cowork' ? '0.0.0.0' : '127.0.0.1',
    dataDir: resolve(options.dataDir ?? env.RED_VIDEO_FLOW_DATA_DIR ?? join(appDir, '.data')),
    distDir: resolve(
      options.webDistDir
        ?? env.RED_VIDEO_FLOW_WEB_DIST_DIR
        ?? join(appDir, '../red-vedio-flow/dist'),
    ),
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
    viteRoot: resolve(
      options.viteRoot
        ?? env.RED_VIDEO_FLOW_VITE_ROOT
        ?? join(workspaceRoot, 'apps/red-vedio-flow'),
    ),
    distribution: options.distribution ?? 'source',
    maasApiKey: options.maasApiKey
      ?? env.RED_VIDEO_FLOW_MAAS_API_KEY
      ?? required('RED_VIDEO_FLOW_MAAS_API_KEY'),
    textModelBaseUrl: trimTrailingSlash(
      env.RED_VIDEO_FLOW_TEXT_MODEL_BASE_URL
        ?? 'https://maas.devops.rednote.life/hackson/v1',
    ),
    textProviderUrl: env.APP_TEXT_PROVIDER_URL?.trim()
      || env.RED_VIDEO_FLOW_TEXT_PROVIDER_URL?.trim()
      || DEFAULT_TEXT_PROVIDER_URL,
    imageProviderUrl: env.APP_IMAGE_PROVIDER_URL?.trim()
      || env.RED_VIDEO_FLOW_IMAGE_PROVIDER_URL?.trim()
      || DEFAULT_IMAGE_PROVIDER_URL,
    videoProviderUrl: env.APP_VIDEO_PROVIDER_URL?.trim()
      || env.RED_VIDEO_FLOW_VIDEO_PROVIDER_URL?.trim()
      || DEFAULT_VIDEO_PROVIDER_URL,
    credentialEncryptionKey: env.APP_CREDENTIAL_ENCRYPTION_KEY
      ?? env.RED_VIDEO_FLOW_CREDENTIAL_ENCRYPTION_KEY
      ?? `local-development:${resolve(options.dataDir ?? env.RED_VIDEO_FLOW_DATA_DIR ?? join(appDir, '.data'))}`,
    requireSso: deploymentMode === 'cowork'
      ? true
      : options.requireSso ?? env.RED_VIDEO_FLOW_REQUIRE_SSO === 'true',
    database,
    deploymentMode,
    runtimePublicOrigin: trimOptionalOrigin(env.APP_RUNTIME_PUBLIC_ORIGIN),
    runtimeHost: env.APP_RUNTIME_HOST?.trim().toLowerCase() || undefined,
    mainAppOrigin: trimOptionalOrigin(env.APP_MAIN_ORIGIN),
    runTimeoutMs: readNumber(env.RED_VIDEO_FLOW_RUN_TIMEOUT_MS, 120_000, 'run timeout'),
    runReaperIntervalMs: readNumber(env.RED_VIDEO_FLOW_RUN_REAPER_INTERVAL_MS, 30_000, 'run reaper interval'),
    visualTaskIntervalMs: readNumber(env.RED_VIDEO_FLOW_VISUAL_TASK_INTERVAL_MS, 5_000, 'visual task interval'),
    visualTaskBatchSize: readNumber(env.RED_VIDEO_FLOW_VISUAL_TASK_BATCH_SIZE, 4, 'visual task batch size'),
    visualTaskImageTimeoutMs: readNumber(env.RED_VIDEO_FLOW_VISUAL_TASK_IMAGE_TIMEOUT_MS, 10 * 60_000, 'image timeout'),
    visualTaskVideoTimeoutMs: readNumber(env.RED_VIDEO_FLOW_VISUAL_TASK_VIDEO_TIMEOUT_MS, 30 * 60_000, 'video timeout'),
    visualTaskLeaseDurationMs: readNumber(env.RED_VIDEO_FLOW_VISUAL_TASK_LEASE_DURATION_MS, 60_000, 'visual task lease'),
    pluginRequestTimeoutMs: readNumber(env.RED_VIDEO_FLOW_PLUGIN_REQUEST_TIMEOUT_MS, 30_000, 'plugin request timeout'),
    pluginShutdownGraceMs: readNumber(env.RED_VIDEO_FLOW_PLUGIN_SHUTDOWN_GRACE_MS, 3_000, 'plugin shutdown grace'),
    workerConcurrency: readNumber(
      env.APP_WORKER_CONCURRENCY ?? env.RED_VIDEO_FLOW_WORKER_CONCURRENCY,
      3,
      'worker concurrency',
    ),
    pluginDirs: pluginDirs.map((item) => resolve(item)),
  }
}

function withDotEnv(cwd: string, env: NodeJS.ProcessEnv) {
  const path = join(cwd, '.env')
  if (!existsSync(path)) return env
  const fileEnv: NodeJS.ProcessEnv = {}
  for (const source of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const line = source.trim()
    if (!line || line.startsWith('#')) continue
    const separator = line.indexOf('=')
    if (separator < 1) continue
    const key = line.slice(0, separator).trim()
    let value = line.slice(separator + 1).trim()
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1)
    }
    fileEnv[key] = value
  }
  if (env === process.env) {
    for (const [key, value] of Object.entries(fileEnv)) {
      if (process.env[key] === undefined) process.env[key] = value
    }
  }
  return { ...fileEnv, ...env }
}

function required(name: string): never {
  throw new Error(`${name} is required; configure it in .env`)
}

function trimOptionalOrigin(value: string | undefined) {
  const normalized = value?.trim().replace(/\/$/, '')
  return normalized || undefined
}

export function readDatabaseProperties(
  propertiesPath: string,
): PostgresConnectionConfig | undefined {
  if (!existsSync(propertiesPath)) return undefined
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
  const allowedKeys = new Set([
    'db.type',
    'db.host',
    'db.port',
    'db.username',
    'db.password',
    'db.database',
  ])
  const unexpectedKeys = Object.keys(properties).filter((key) => !allowedKeys.has(key))
  if (unexpectedKeys.length) {
    throw new Error(`unsupported db.properties keys: ${unexpectedKeys.join(', ')}`)
  }
  if (properties['db.type'] !== 'postgresql') {
    throw new Error('db.type must be postgresql')
  }
  const requiredKeys = [...allowedKeys]
  const missingKeys = requiredKeys.filter((key) => !properties[key])
  if (missingKeys.length) {
    throw new Error(`missing db.properties keys: ${missingKeys.join(', ')}`)
  }
  const port = Number(properties['db.port'])
  if (!Number.isInteger(port) || port <= 0 || port > 65_535) {
    throw new Error(`invalid db.port: ${properties['db.port']}`)
  }
  return {
    host: properties['db.host'],
    port,
    username: properties['db.username'],
    password: properties['db.password'],
    database: properties['db.database'],
  }
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
