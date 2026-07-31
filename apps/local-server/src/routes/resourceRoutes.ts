import {
  handleResourceRoutes as handleSharedResourceRoutes,
  type ResourceApi,
} from '@red-video-flow/api-server'
import type { LocalServerRuntime } from '../runtime.js'
import type { RequestContext } from '../http.js'

export async function handleResourceRoutes(
  runtime: LocalServerRuntime,
  ctx: RequestContext,
) {
  const resources = runtime.backend.resources
  const api: ResourceApi = {
    list: (input) => resources.list(input),
    get: (id) => resources.get(id),
    createText: (input) => resources.createText(input),
    rename: (resource, name) => resources.rename(resource.id, name),
    softDelete: (id) => resources.softDelete(id),
    bindings: (resourceId) => resources.bindings(resourceId),
    bind: (input) => resources.bind(input),
  }
  return handleSharedResourceRoutes(ctx, api)
}
