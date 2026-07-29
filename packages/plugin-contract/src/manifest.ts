import {
  PLUGIN_API_VERSION,
  type PluginContributions,
  type PluginManifest,
  type SanitizedPluginManifest,
} from './types.js'

const pluginIdPattern = /^[a-z0-9][a-z0-9._-]*$/
const contributionIdPattern = /^[a-z0-9][a-z0-9._-]*$/
const secretNamePattern = /^[A-Z_][A-Z0-9_]*$/

export function parsePluginManifest(value: unknown): PluginManifest {
  if (!isRecord(value)) throw new Error('plugin manifest must be an object')
  const id = requireString(value.id, 'id')
  if (!pluginIdPattern.test(id)) throw new Error(`invalid plugin id: ${id}`)
  const apiVersion = requireString(value.apiVersion, 'apiVersion')
  if (apiVersion !== PLUGIN_API_VERSION) {
    throw new Error(`unsupported plugin apiVersion: ${apiVersion}`)
  }
  if (!isRecord(value.backend)) throw new Error('plugin backend must be an object')
  if (value.backend.runtime !== 'process') throw new Error('plugin backend.runtime must be "process"')

  const manifest: PluginManifest = {
    id,
    name: requireString(value.name, 'name'),
    version: requireString(value.version, 'version'),
    apiVersion,
    backend: {
      runtime: 'process',
      command: requireString(value.backend.command, 'backend.command'),
      args: optionalStringArray(value.backend.args, 'backend.args'),
      cwd: optionalString(value.backend.cwd, 'backend.cwd'),
    },
    activationEvents: parseEnumArray(
      value.activationEvents,
      ['onStartup'],
      'activationEvents',
    ),
    contributes: parseContributions(value.contributes),
    secrets: parseSecrets(value.secrets),
  }

  validateContributionIds(manifest)
  return manifest
}

export function sanitizePluginManifest(manifest: PluginManifest): SanitizedPluginManifest {
  const { secrets, ...safe } = manifest
  return {
    ...safe,
    secretsConfigured: secrets
      ? Object.fromEntries(Object.keys(secrets).map((key) => [key, true]))
      : undefined,
  }
}

export function redactPluginSecrets(text: string, manifest: PluginManifest) {
  let output = text
  for (const value of Object.values(manifest.secrets ?? {})) {
    if (value) output = output.split(value).join('[REDACTED]')
  }
  return output
}

export function redactPluginValue(value: unknown, manifest: PluginManifest): unknown {
  if (typeof value === 'string') return redactPluginSecrets(value, manifest)
  if (Array.isArray(value)) return value.map((item) => redactPluginValue(item, manifest))
  if (!isRecord(value)) return value
  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [key, redactPluginValue(item, manifest)]),
  )
}

function parseContributions(value: unknown): PluginContributions | undefined {
  if (value === undefined) return undefined
  if (!isRecord(value)) throw new Error('contributes must be an object')
  return {
    commands: parseArray(value.commands, 'contributes.commands', (item, index) => {
      if (!isRecord(item)) throw new Error(`contributes.commands[${index}] must be an object`)
      return {
        id: requireString(item.id, `contributes.commands[${index}].id`),
        title: requireString(item.title, `contributes.commands[${index}].title`),
        description: optionalString(item.description, `contributes.commands[${index}].description`),
        inputSchema: optionalRecord(item.inputSchema, `contributes.commands[${index}].inputSchema`),
        outputSchema: optionalRecord(item.outputSchema, `contributes.commands[${index}].outputSchema`),
      }
    }),
    visualProviders: parseArray(value.visualProviders, 'contributes.visualProviders', (item, index) => {
      if (!isRecord(item)) throw new Error(`contributes.visualProviders[${index}] must be an object`)
      return {
        id: requireString(item.id, `contributes.visualProviders[${index}].id`),
        title: requireString(item.title, `contributes.visualProviders[${index}].title`),
        vendor: optionalString(item.vendor, `contributes.visualProviders[${index}].vendor`),
        capabilities: parseEnumArray(
          item.capabilities,
          ['text-to-image', 'image-to-image', 'text-to-video', 'image-to-video', 'frames-to-video', 'image-upscale'],
          `contributes.visualProviders[${index}].capabilities`,
        ) ?? [],
        optionsSchema: optionalRecord(
          item.optionsSchema,
          `contributes.visualProviders[${index}].optionsSchema`,
        ),
      }
    }),
    agentProviders: parseArray(value.agentProviders, 'contributes.agentProviders', (item, index) => {
      if (!isRecord(item)) throw new Error(`contributes.agentProviders[${index}] must be an object`)
      return {
        id: requireString(item.id, `contributes.agentProviders[${index}].id`),
        title: requireString(item.title, `contributes.agentProviders[${index}].title`),
        vendor: optionalString(item.vendor, `contributes.agentProviders[${index}].vendor`),
        models: parseArray(item.models, `contributes.agentProviders[${index}].models`, (model, modelIndex) => {
          if (!isRecord(model)) throw new Error(`agent model ${modelIndex} must be an object`)
          return {
            id: requireString(model.id, `agent model ${modelIndex}.id`),
            label: requireString(model.label, `agent model ${modelIndex}.label`),
          }
        }),
      }
    }),
    nodeExecutors: parseArray(value.nodeExecutors, 'contributes.nodeExecutors', (item, index) => {
      if (!isRecord(item)) throw new Error(`contributes.nodeExecutors[${index}] must be an object`)
      return {
        id: requireString(item.id, `contributes.nodeExecutors[${index}].id`),
        nodeTypes: optionalStringArray(item.nodeTypes, `contributes.nodeExecutors[${index}].nodeTypes`) ?? [],
        inputSchema: optionalRecord(item.inputSchema, `contributes.nodeExecutors[${index}].inputSchema`),
        outputSchema: optionalRecord(item.outputSchema, `contributes.nodeExecutors[${index}].outputSchema`),
      }
    }),
    backgroundWorkers: parseArray(value.backgroundWorkers, 'contributes.backgroundWorkers', (item, index) => {
      if (!isRecord(item)) throw new Error(`contributes.backgroundWorkers[${index}] must be an object`)
      return {
        id: requireString(item.id, `contributes.backgroundWorkers[${index}].id`),
        autoStart: optionalBoolean(item.autoStart, `contributes.backgroundWorkers[${index}].autoStart`),
      }
    }),
  }
}

function parseSecrets(value: unknown) {
  if (value === undefined) return undefined
  if (!isRecord(value)) throw new Error('secrets must be an object')
  const secrets: Record<string, string> = {}
  for (const [key, secret] of Object.entries(value)) {
    if (!secretNamePattern.test(key)) throw new Error(`invalid secret name: ${key}`)
    secrets[key] = requireString(secret, `secrets.${key}`)
  }
  return secrets
}

function validateContributionIds(manifest: PluginManifest) {
  for (const [groupName, value] of Object.entries(manifest.contributes ?? {})) {
    if (!Array.isArray(value)) continue
    const ids = new Set<string>()
    for (const contribution of value as Array<{ id: string }>) {
      if (!contributionIdPattern.test(contribution.id)) {
        throw new Error(`invalid contribution id: ${contribution.id}`)
      }
      if (ids.has(contribution.id)) {
        throw new Error(
          `duplicate ${groupName} contribution id in plugin ${manifest.id}: ${contribution.id}`,
        )
      }
      ids.add(contribution.id)
    }
  }
}

function parseArray<T>(
  value: unknown,
  field: string,
  parser: (item: unknown, index: number) => T,
): T[] | undefined {
  if (value === undefined) return undefined
  if (!Array.isArray(value)) throw new Error(`${field} must be an array`)
  return value.map(parser)
}

function parseEnumArray<T extends string>(
  value: unknown,
  allowed: readonly T[],
  field: string,
): T[] | undefined {
  if (value === undefined) return undefined
  if (!Array.isArray(value)) throw new Error(`${field} must be an array`)
  return value.map((item) => {
    if (typeof item !== 'string' || !allowed.includes(item as T)) {
      throw new Error(`${field} contains unsupported value: ${String(item)}`)
    }
    return item as T
  })
}

function optionalStringArray(value: unknown, field: string) {
  if (value === undefined) return undefined
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string')) {
    throw new Error(`${field} must be an array of strings`)
  }
  return value as string[]
}

function requireString(value: unknown, field: string) {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${field} must be a non-empty string`)
  return value
}

function optionalString(value: unknown, field: string) {
  if (value === undefined) return undefined
  if (typeof value !== 'string') throw new Error(`${field} must be a string`)
  return value
}

function optionalBoolean(value: unknown, field: string) {
  if (value === undefined) return undefined
  if (typeof value !== 'boolean') throw new Error(`${field} must be a boolean`)
  return value
}

function optionalRecord(value: unknown, field: string) {
  if (value === undefined) return undefined
  if (!isRecord(value)) throw new Error(`${field} must be an object`)
  return value
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}
