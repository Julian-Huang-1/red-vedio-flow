import type { LocalServerRuntime } from '../runtime.js'
import { builtinVisualModels } from '@red-video-flow/workflow-runtime'
import { HttpError, readJson, resourcePath, sendJson, type RequestContext } from '../http.js'

export async function handleDiscoveryRoutes(runtime: LocalServerRuntime, ctx: RequestContext) {
  const { req, res, pathname } = ctx
  if (req.method === 'GET' && pathname === '/api/runtime') {
    const info = runtime.runtimeInfo.get()
    if (!info) {
      sendJson(res, 503, { error: 'runtime is not ready' })
      return true
    }
    sendJson(res, 200, {
      ...info,
      distribution: runtime.config.distribution,
      requiresNodeInstallation: false,
    })
    return true
  }
  if (req.method === 'POST' && pathname === '/api/agent-registration-tokens') {
    const body = await readJson(req)
    if (typeof body.agentId !== 'string') {
      sendJson(res, 400, { error: 'agentId is required' })
      return true
    }
    const provider = runtime.plugins.contributions.getAgentProvider(body.agentId)
    if (!provider) {
      sendJson(res, 404, { error: `agent provider not found: ${body.agentId}` })
      return true
    }
    const grant = runtime.agentRegistrationTokens.create(body.agentId)
    const modelUpdateGrant = runtime.agentModelUpdateTokens.create(body.agentId)
    const command = buildRegistrationCommand(
      runtime.config.rvfCliCommand,
      body.agentId,
      runtime.runtimeInfo.get()?.baseUrl,
      grant.token,
    )
    sendJson(res, 200, {
      ...grant,
      distribution: runtime.config.distribution,
      requiresNodeInstallation: false,
      command,
      modelUpdateTokenExpiresAt: modelUpdateGrant.expiresAt,
      prompt: buildRegistrationPrompt(
        body.agentId,
        contributionTitle(provider.contribution),
        command,
        buildModelUpdateCommand(
          runtime.config.rvfCliCommand,
          body.agentId,
          runtime.runtimeInfo.get()?.baseUrl,
          modelUpdateGrant.token,
        ),
        runtime.config.distribution,
      ),
    })
    return true
  }
  if (req.method === 'GET' && pathname === '/api/agents') {
    sendJson(res, 200, await listPluginAgents(runtime))
    return true
  }
  if (req.method === 'POST' && pathname === '/api/agents/register') {
    const body = await readJson(req)
    if (
      typeof body.id !== 'string'
      || typeof body.binPath !== 'string'
      || typeof body.registrationToken !== 'string'
    ) {
      sendJson(res, 400, { error: 'id, binPath and registrationToken are required' })
      return true
    }
    if (!runtime.plugins.contributions.getAgentProvider(body.id)) {
      sendJson(res, 404, { error: `agent provider not found: ${body.id}` })
      return true
    }
    runtime.agentRegistrationTokens.assert(body.registrationToken, body.id)
    const registered = runtime.agentRegistry.register(body.id, body.binPath)
    runtime.agentRegistrationTokens.consume(body.registrationToken, body.id)
    sendJson(res, 200, { agent: registered })
    return true
  }
  if (req.method === 'POST' && pathname === '/api/agent-model-update-tokens') {
    const body = await readJson(req)
    if (typeof body.agentId !== 'string') {
      sendJson(res, 400, { error: 'agentId is required' })
      return true
    }
    const provider = runtime.plugins.contributions.getAgentProvider(body.agentId)
    if (!provider) throw new HttpError(404, `agent provider not found: ${body.agentId}`)
    if (!runtime.agentRegistry.get(body.agentId)) {
      throw new HttpError(404, `registered agent not found: ${body.agentId}`)
    }
    const grant = runtime.agentModelUpdateTokens.create(body.agentId)
    const command = buildModelUpdateCommand(
      runtime.config.rvfCliCommand,
      body.agentId,
      runtime.runtimeInfo.get()?.baseUrl,
      grant.token,
    )
    sendJson(res, 200, {
      ...grant,
      command,
      prompt: buildModelUpdatePrompt(
        body.agentId,
        contributionTitle(provider.contribution),
        command,
      ),
    })
    return true
  }
  const agentPath = resourcePath(pathname, '/api/agents/')
  if (agentPath?.length === 1 && req.method === 'GET') {
    const registered = runtime.agentRegistry.get(agentPath[0])
    if (!registered) {
      sendJson(res, 404, { error: `registered agent not found: ${agentPath[0]}` })
      return true
    }
    sendJson(res, 200, { agent: registered })
    return true
  }
  if (agentPath?.length === 1 && req.method === 'DELETE') {
    sendJson(res, 200, { agent: runtime.agentRegistry.unregister(agentPath[0]) })
    return true
  }
  if (agentPath?.length === 2 && agentPath[1] === 'verify' && req.method === 'POST') {
    const body = await readJson(req)
    const timeoutMs = typeof body.timeoutMs === 'number' ? body.timeoutMs : undefined
    sendJson(res, 200, { verification: await runtime.agentRegistry.verify(agentPath[0], timeoutMs) })
    return true
  }
  if (agentPath?.length === 2 && agentPath[1] === 'models' && (req.method === 'GET' || req.method === 'POST')) {
    if (req.method === 'GET') {
      sendJson(res, 200, readAgentModels(runtime, agentPath[0]))
      return true
    }
    const body = await readJson(req)
    if (typeof body.updateToken !== 'string') {
      throw new HttpError(400, 'updateToken is required')
    }
    runtime.agentModelUpdateTokens.assert(body.updateToken, agentPath[0])
    const discovery = readAgentModelDiscovery(body.discovery)
    const stored = runtime.agentRegistry.saveModelDiscovery(agentPath[0], discovery)
    runtime.agentModelUpdateTokens.consume(body.updateToken, agentPath[0])
    sendJson(res, 200, { agentId: agentPath[0], ...stored, source: 'agent' })
    return true
  }
  if (req.method === 'GET' && pathname === '/api/visual-models') {
    sendJson(res, 200, builtinVisualModels)
    return true
  }
  return false
}

function buildRegistrationCommand(
  rvfCommand: string,
  agentId: string,
  baseUrl: string | undefined,
  token: string,
) {
  return [
    rvfCommand,
    'agent register',
    shellQuote(agentId),
    '--bin "<CLI_ABSOLUTE_PATH>"',
    baseUrl ? `--base-url ${shellQuote(baseUrl)}` : '',
    `--registration-token ${shellQuote(token)}`,
  ].filter(Boolean).join(' ')
}

function buildRegistrationPrompt(
  agentId: string,
  label: string,
  command: string,
  modelUpdateCommand: string,
  distribution: 'source' | 'electron',
) {
  const environmentMessage = distribution === 'electron'
    ? '当前为 Electron 安装环境，命令使用应用内置 rvf；不需要安装 Node.js、pnpm 或全局 rvf。'
    : '当前为源码开发环境，命令使用 Local Server 正在运行的 Node.js 和项目 CLI 绝对路径；不依赖 PATH，也不需要执行 pnpm。'
  return [
    `请将你当前使用的 ${label} CLI 注册到 Red Video Flow。`,
    '',
    `Agent ID：${agentId}`,
    environmentMessage,
    '',
    '请使用 command -v、which、type -a 或自身运行环境确定 CLI 的真实绝对路径。',
    '将下方命令中的 <CLI_ABSOLUTE_PATH> 替换为该路径后执行：',
    '',
    '```sh',
    command,
    '```',
    '',
    '注册成功后，请继续检查当前 CLI 和登录账号实际可以使用的模型，并执行下面的模型更新命令。',
    '将一个符合指定结构的 JSON 对象通过 stdin 传给命令；不要把 JSON 写入文件：',
    '',
    '```sh',
    modelUpdateCommand,
    '```',
    '',
    modelDiscoverySchemaText(),
    '',
    '不要猜测路径，不要修改 PATH，不要安装或升级软件，不要使用 sudo。',
    '完成后报告 Agent ID、CLI 绝对路径、注册结果和模型更新结果。',
  ].join('\n')
}

function buildModelUpdateCommand(
  rvfCommand: string,
  agentId: string,
  baseUrl: string | undefined,
  token: string,
) {
  return [
    rvfCommand,
    'agent models update',
    shellQuote(agentId),
    baseUrl ? `--base-url ${shellQuote(baseUrl)}` : '',
    `--update-token ${shellQuote(token)}`,
    '--stdin',
  ].filter(Boolean).join(' ')
}

function buildModelUpdatePrompt(agentId: string, label: string, command: string) {
  return [
    `请检查当前 ${label} CLI 和登录账号实际可以使用哪些模型，并更新 Red Video Flow。`,
    '',
    `Agent ID：${agentId}`,
    '',
    '请使用当前 Agent CLI 自身能力、只读配置和账号信息完成发现。',
    '发现后，将一个符合指定结构的 JSON 对象通过 stdin 传给下面的命令；不要把 JSON 写入文件：',
    '',
    '```sh',
    command,
    '```',
    '',
    modelDiscoverySchemaText(),
    '',
    '不要安装或升级软件，不要修改配置、登录状态、PATH 或项目文件。',
    '不要猜测模型；无法确认账号权限时请降低 confidence。',
    'CLI 更新完成后，请在当前对话中用自然语言报告发现的模型、可信度和更新结果。',
  ].join('\n')
}

function modelDiscoverySchemaText() {
  return [
    'stdin JSON 格式：',
    '{"models":[{"id":"模型ID","label":"显示名称","available":true}],"defaultModelId":"模型ID或null","confidence":"account|cli|inferred|unknown","warning":"可选警告"}',
  ].join('\n')
}

function shellQuote(value: string) {
  if (process.platform === 'win32') return `"${value.replaceAll('"', '""')}"`
  return `'${value.replaceAll("'", "'\\''")}'`
}

function contributionTitle(contribution: { title?: string }) {
  return contribution.title ?? 'Agent'
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
    const registered = runtime.agentRegistry.get(contribution.id)
    const detected = healthByPlugin.get(pluginId)?.agents.find(
      (agent) => agent.id === contribution.id,
    )
    return {
      id: contribution.id,
      label: contribution.title,
      vendor: contribution.vendor ?? 'Plugin',
      protocol: detected?.protocol ?? 'plugin',
      available: Boolean(registered || detected?.available),
      invokable: Boolean(
        registered
          ? detected?.protocol !== 'acp' && detected?.protocol !== 'pi-rpc'
          : detected?.invokable,
      ),
      binPath: registered?.binPath ?? detected?.binPath ?? null,
      discoverySource: registered ? 'registered' : detected?.binPath ? 'path' : null,
      registeredAt: registered?.registeredAt,
      fallbackModels: registered?.modelDiscovery?.models
        ?? contribution.models
        ?? [{ id: 'default', label: 'Default (plugin config)' }],
      modelDiscovery: registered?.modelDiscovery
        ? { ...registered.modelDiscovery, source: 'cache' }
        : {
            models: contribution.models ?? [{ id: 'default', label: 'Default (plugin config)' }],
            source: 'manifest',
            confidence: 'unknown',
            warning: 'Models are plugin candidates and have not been confirmed by the registered CLI.',
          },
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

function readAgentModels(runtime: LocalServerRuntime, agentId: string) {
  const provider = runtime.plugins.contributions.getAgentProvider(agentId)
  if (!provider) throw new HttpError(404, `agent provider not found: ${agentId}`)
  const registered = runtime.agentRegistry.get(agentId)
  const fallbackModels = provider.contribution.models
    ?? [{ id: 'default', label: 'Default (plugin config)' }]
  if (registered?.modelDiscovery) {
    return { agentId, ...registered.modelDiscovery, source: 'cache' }
  }
  return {
    agentId,
    models: fallbackModels,
    source: 'manifest',
    confidence: 'unknown',
    warning: registered
      ? 'No model discovery has completed; showing plugin model candidates.'
      : 'Agent CLI is not registered; showing plugin model candidates.',
  }
}

function readAgentModelDiscovery(value: unknown) {
  if (!isRecord(value) || !Array.isArray(value.models)) throw new Error('invalid agent model discovery')
  const models = value.models.flatMap((item) => {
    if (!isRecord(item) || typeof item.id !== 'string' || typeof item.label !== 'string') return []
    return [{
      id: item.id,
      label: item.label,
      available: typeof item.available === 'boolean' ? item.available : true,
    }]
  })
  if (!models.length) throw new Error('agent model discovery returned no models')
  const confidence: 'account' | 'cli' | 'inferred' | 'unknown' = value.confidence === 'account'
    || value.confidence === 'cli'
    || value.confidence === 'inferred'
    || value.confidence === 'unknown'
    ? value.confidence
    : 'unknown'
  return {
    models,
    defaultModelId: typeof value.defaultModelId === 'string' ? value.defaultModelId : undefined,
    confidence,
    warning: typeof value.warning === 'string' ? value.warning : undefined,
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
      optionsSchema: contribution.optionsSchema,
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
