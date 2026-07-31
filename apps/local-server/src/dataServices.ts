import type {
  PostgresPatchWorkflowInput,
  PostgresSaveWorkflowInput,
} from '@red-video-flow/postgres-backend'
import type { LocalServerRuntime } from './runtime.js'

export function workflowDataService(runtime: LocalServerRuntime) {
  const postgres = runtime.postgresInfrastructure?.postgresWorkflows
  const local = runtime.backend.workflows
  if (postgres) {
    return {
      list: async () => postgres.list(),
      get: async (id: string) => postgres.get(id),
      create: async (input: Partial<PostgresSaveWorkflowInput> = {}) => {
        const document = await postgres.create(input)
        runtime.backend.workflowRepository.save(document)
        return document
      },
      save: async (input: PostgresSaveWorkflowInput) => {
        const document = await postgres.save(input)
        runtime.backend.workflowRepository.save(document)
        return document
      },
      patch: async (input: PostgresPatchWorkflowInput) => {
        const document = await postgres.patch(input)
        runtime.backend.workflowRepository.save(document)
        return document
      },
      delete: async (id: string) => {
        await postgres.delete(id)
        runtime.backend.workflowRepository.delete(id)
      },
    }
  }
  return {
    list: async () => local.list(),
    get: async (id: string) => local.get(id),
    create: async (input: Partial<PostgresSaveWorkflowInput> = {}) => local.create(input),
    save: async (input: PostgresSaveWorkflowInput) => local.save(input),
    patch: async (input: PostgresPatchWorkflowInput) => local.patch(input),
    delete: async (id: string) => local.delete(id),
  }
}

export async function hydrateWorkflowCache(runtime: LocalServerRuntime) {
  const postgres = runtime.postgresInfrastructure?.postgresWorkflows
  if (!postgres) return
  for (const workflow of await postgres.list()) {
    runtime.backend.workflowRepository.save(workflow)
  }
}

export async function hydrateRunCache(runtime: LocalServerRuntime) {
  const postgres = runtime.postgresInfrastructure?.workflowRuns
  if (!postgres) return
  for (const run of await postgres.listAll()) {
    runtime.backend.runRepository.save(run)
    for (const event of await postgres.listEvents(run.id)) {
      runtime.backend.runRepository.hydrateEvent(event)
    }
  }
}

export async function hydrateWorkflowAppRunCache(runtime: LocalServerRuntime) {
  const postgres = runtime.postgresInfrastructure?.postgresWorkflowAppRuns
  if (!postgres) return
  for (const run of await postgres.listAll()) {
    runtime.backend.workflowAppRuns.save(run)
  }
}

export async function hydrateResourceCache(runtime: LocalServerRuntime) {
  const postgres = runtime.postgresInfrastructure?.postgresResources
  if (!postgres) return
  for (const resource of await postgres.listAll()) {
    runtime.backend.resources.hydrate(resource)
  }
  for (const binding of await postgres.listAllBindings()) {
    runtime.backend.resources.hydrateBinding(binding)
  }
}

export async function hydrateChatCache(runtime: LocalServerRuntime) {
  const postgres = runtime.postgresInfrastructure?.postgresChats
  if (!postgres) return
  for (const session of await postgres.listAllSessions()) {
    runtime.backend.chatRepository.hydrateSession(session)
  }
  for (const message of await postgres.listAllMessages()) {
    runtime.backend.chatRepository.hydrateMessage(message)
  }
}
