import type { LocalServerRuntime } from '../runtime.js'
import { sendJson, type RequestContext } from '../http.js'

export async function handleDiscoveryRoutes(runtime: LocalServerRuntime, ctx: RequestContext) {
  const { req, res, pathname } = ctx
  if (req.method === 'GET' && pathname === '/api/agents') {
    sendJson(res, 200, await listPluginAgents(runtime))
    return true
  }
  if (req.method === 'GET' && pathname === '/api/visual-models') {
    sendJson(res, 200, await listPluginVisualModels(runtime))
    return true
  }
  return false
}

async function listPluginAgents(runtime: LocalServerRuntime) {
  const providers = runtime.plugins.contributions.listAgentProviders()
  const healthByPlugin = new Map<string, AgentDescription>()
  await Promise.all([...new Set(providers.map((provider) => provider.pluginId))].map(async (pluginId) => {
    try {
      healthByPlugin.set(
        pluginId,
        readAgentDescription(await runtime.plugins.call(pluginId, 'agent.describe')),
      )
    } catch {
      healthByPlugin.set(pluginId, { agents: [] })
    }
  }))
  const agents = providers.map(({ pluginId, contribution }) => {
    const detected = healthByPlugin.get(pluginId)?.agents.find(
      (agent) => agent.id === contribution.id,
    )
    return {
      id: contribution.id,
      label: contribution.title,
      vendor: contribution.vendor ?? 'Plugin',
      protocol: detected?.protocol ?? 'plugin',
      available: Boolean(detected?.available),
      invokable: Boolean(detected?.invokable),
      binPath: detected?.binPath ?? null,
      fallbackModels: contribution.models ?? [{ id: 'default', label: 'Default (plugin config)' }],
      pluginId,
    }
  })
  return {
    agents,
    installedCount: agents.filter((agent) => agent.available).length,
    invokableCount: agents.filter((agent) => agent.invokable).length,
    platform: process.platform,
  }
}

async function listPluginVisualModels(runtime: LocalServerRuntime) {
  const providers = runtime.plugins.contributions.listVisualProviders()
  const healthByPlugin = new Map<string, VisualDescription>()
  await Promise.all([...new Set(providers.map((provider) => provider.pluginId))].map(async (pluginId) => {
    try {
      healthByPlugin.set(
        pluginId,
        readVisualDescription(await runtime.plugins.call(pluginId, 'visual.describe')),
      )
    } catch {
      healthByPlugin.set(pluginId, { available: false })
    }
  }))
  const models = providers.map(({ pluginId, contribution }) => {
    const health = healthByPlugin.get(pluginId)
    return {
      id: contribution.id,
      label: contribution.title,
      vendor: contribution.vendor ?? 'Plugin',
      available: Boolean(health?.available),
      invokable: Boolean(health?.available),
      binPath: health?.binPath ?? null,
      capabilities: contribution.capabilities,
      pluginId,
    }
  })
  return {
    models,
    installedCount: models.filter((model) => model.available).length,
    invokableCount: models.filter((model) => model.invokable).length,
  }
}

type AgentDescription = {
  agents: Array<{
    id: string
    protocol?: string
    available?: boolean
    invokable?: boolean
    binPath?: string | null
  }>
}

type VisualDescription = {
  available: boolean
  binPath?: string | null
}

function readAgentDescription(value: unknown): AgentDescription {
  if (!isRecord(value) || !Array.isArray(value.agents)) return { agents: [] }
  return {
    agents: value.agents.flatMap((item) => {
      if (!isRecord(item) || typeof item.id !== 'string') return []
      return [{
        id: item.id,
        protocol: typeof item.protocol === 'string' ? item.protocol : undefined,
        available: typeof item.available === 'boolean' ? item.available : undefined,
        invokable: typeof item.invokable === 'boolean' ? item.invokable : undefined,
        binPath: typeof item.binPath === 'string' || item.binPath === null
          ? item.binPath
          : undefined,
      }]
    }),
  }
}

function readVisualDescription(value: unknown): VisualDescription {
  if (!isRecord(value)) return { available: false }
  return {
    available: value.available === true,
    binPath: typeof value.binPath === 'string' || value.binPath === null
      ? value.binPath
      : undefined,
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}
