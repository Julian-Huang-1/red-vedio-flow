import type { LocalServerRuntime } from '../runtime.js'
import { sendJson, type RequestContext } from '../http.js'

const DEFAULT_MODEL_BASE_URL = 'https://maas.devops.rednote.life/hackson'

const DEFAULT_MODELS = [
  {
    name: 'GPT-5.6 Sol',
    model: 'GPT-5.6 Sol',
  },
  {
    name: 'Claude Sonnet 5',
    model: 'Claude Sonnet 5',
  },
  {
    name: 'claude opus 4.8',
    model: 'claude opus 4.8',
  },
] as const

export function handleDefaultModelRoutes(
  runtime: LocalServerRuntime,
  ctx: RequestContext,
) {
  if (ctx.req.method !== 'GET' || ctx.pathname !== '/api/default-models') return false

  sendJson(ctx.res, 200, {
    models: DEFAULT_MODELS.map((model) => ({
      ...model,
      baseUrl: DEFAULT_MODEL_BASE_URL,
      apiKey: runtime.config.maasApiKey,
    })),
  })
  return true
}
