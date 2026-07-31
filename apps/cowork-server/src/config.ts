import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { PostgresConnectionConfig } from '@red-video-flow/postgres-backend'
import {
  DEFAULT_IMAGE_PROVIDER_URL,
  DEFAULT_TEXT_PROVIDER_URL,
  DEFAULT_VIDEO_PROVIDER_URL,
} from '@red-video-flow/workflow-runtime/network-provider'

export {
  DEFAULT_IMAGE_PROVIDER_URL,
  DEFAULT_TEXT_PROVIDER_URL,
  DEFAULT_VIDEO_PROVIDER_URL,
} from '@red-video-flow/workflow-runtime/network-provider'

export type CoworkConfig = {
  host: '0.0.0.0'
  port: number
  database: PostgresConnectionConfig
  credentialEncryptionKey: string
  webDistDir: string
  textProviderUrl: string
  imageProviderUrl: string
  videoProviderUrl: string
  workerConcurrency: number
}

const dbKeys = [
  'db.type',
  'db.host',
  'db.port',
  'db.username',
  'db.password',
  'db.database',
] as const

export function resolveCoworkConfig(
  cwd = process.cwd(),
  env: NodeJS.ProcessEnv = process.env,
): CoworkConfig {
  const database = readCoworkDatabase(join(cwd, 'db.properties'))
  return {
    host: '0.0.0.0',
    port: positiveInteger(env.APP_PORT, 3000, 'APP_PORT'),
    database,
    credentialEncryptionKey: env.APP_CREDENTIAL_ENCRYPTION_KEY?.trim()
      || deriveCredentialEncryptionKey(database.password),
    webDistDir: join(cwd, 'public'),
    textProviderUrl: optional(env.APP_TEXT_PROVIDER_URL, DEFAULT_TEXT_PROVIDER_URL),
    imageProviderUrl: optional(env.APP_IMAGE_PROVIDER_URL, DEFAULT_IMAGE_PROVIDER_URL),
    videoProviderUrl: optional(env.APP_VIDEO_PROVIDER_URL, DEFAULT_VIDEO_PROVIDER_URL),
    workerConcurrency: positiveInteger(env.APP_WORKER_CONCURRENCY, 3, 'APP_WORKER_CONCURRENCY'),
  }
}

function deriveCredentialEncryptionKey(databasePassword: string) {
  return createHash('sha256')
    .update('red-video-flow:credential-encryption:v1\0')
    .update(databasePassword)
    .digest('hex')
}

export function readCoworkDatabase(path: string): PostgresConnectionConfig {
  if (!existsSync(path)) throw new Error('db.properties is required in the application root')
  const properties: Record<string, string> = {}
  for (const source of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const line = source.trim()
    if (!line || line.startsWith('#')) continue
    const separator = line.indexOf('=')
    if (separator < 0) throw new Error(`invalid db.properties line: ${line}`)
    properties[line.slice(0, separator).trim()] = line.slice(separator + 1).trim()
  }
  const unexpected = Object.keys(properties).filter(
    (key) => !dbKeys.includes(key as typeof dbKeys[number]),
  )
  if (unexpected.length) throw new Error(`unsupported db.properties keys: ${unexpected.join(', ')}`)
  const missing = dbKeys.filter((key) => !properties[key])
  if (missing.length) throw new Error(`missing db.properties keys: ${missing.join(', ')}`)
  if (properties['db.type'] !== 'postgresql') throw new Error('db.type must be postgresql')
  return {
    host: properties['db.host'],
    port: positiveInteger(properties['db.port'], 5432, 'db.port'),
    username: properties['db.username'],
    password: properties['db.password'],
    database: properties['db.database'],
  }
}

function optional(value: string | undefined, fallback: string) {
  return value?.trim() || fallback
}

function positiveInteger(value: string | undefined, fallback: number, name: string) {
  const parsed = value === undefined ? fallback : Number(value)
  if (!Number.isInteger(parsed) || parsed <= 0) throw new Error(`${name} must be a positive integer`)
  return parsed
}
