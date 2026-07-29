import type {
  PluginAgentProviderContribution,
  PluginBackgroundWorkerContribution,
  PluginCommandContribution,
  PluginContributions,
  PluginNodeExecutorContribution,
  PluginVisualProviderContribution,
} from '@red-video-flow/plugin-contract'

export type RegisteredContribution<T> = {
  pluginId: string
  contribution: T
}

export class ContributionRegistry {
  private readonly commands = new Map<string, RegisteredContribution<PluginCommandContribution>>()
  private readonly visualProviders = new Map<string, RegisteredContribution<PluginVisualProviderContribution>>()
  private readonly agentProviders = new Map<string, RegisteredContribution<PluginAgentProviderContribution>>()
  private readonly nodeExecutors = new Map<string, RegisteredContribution<PluginNodeExecutorContribution>>()
  private readonly backgroundWorkers = new Map<string, RegisteredContribution<PluginBackgroundWorkerContribution>>()

  register(pluginId: string, contributions: PluginContributions = {}) {
    const inserted: Array<{ registry: Map<string, RegisteredContribution<any>>; id: string }> = []
    try {
      this.registerGroup(this.commands, pluginId, contributions.commands, inserted)
      this.registerGroup(this.visualProviders, pluginId, contributions.visualProviders, inserted)
      this.registerGroup(this.agentProviders, pluginId, contributions.agentProviders, inserted)
      this.registerGroup(this.nodeExecutors, pluginId, contributions.nodeExecutors, inserted)
      this.registerGroup(this.backgroundWorkers, pluginId, contributions.backgroundWorkers, inserted)
    } catch (error) {
      for (const item of inserted) item.registry.delete(item.id)
      throw error
    }
  }

  unregister(pluginId: string) {
    for (const registry of this.registries()) {
      for (const [id, registered] of registry) {
        if (registered.pluginId === pluginId) registry.delete(id)
      }
    }
  }

  getCommand(id: string) {
    return this.commands.get(id)
  }

  getVisualProvider(id: string) {
    return this.visualProviders.get(id)
  }

  getAgentProvider(id: string) {
    return this.agentProviders.get(id)
  }

  getNodeExecutor(id: string) {
    return this.nodeExecutors.get(id)
  }

  getBackgroundWorker(id: string) {
    return this.backgroundWorkers.get(id)
  }

  listCommands() {
    return [...this.commands.values()]
  }

  listVisualProviders() {
    return [...this.visualProviders.values()]
  }

  listAgentProviders() {
    return [...this.agentProviders.values()]
  }

  listNodeExecutors() {
    return [...this.nodeExecutors.values()]
  }

  listBackgroundWorkers() {
    return [...this.backgroundWorkers.values()]
  }

  private registerGroup<T extends { id: string }>(
    registry: Map<string, RegisteredContribution<T>>,
    pluginId: string,
    contributions: T[] | undefined,
    inserted: Array<{ registry: Map<string, RegisteredContribution<any>>; id: string }>,
  ) {
    for (const contribution of contributions ?? []) {
      const existing = registry.get(contribution.id)
      if (existing) {
        throw new Error(
          `contribution ${contribution.id} from ${pluginId} conflicts with plugin ${existing.pluginId}`,
        )
      }
      registry.set(contribution.id, { pluginId, contribution })
      inserted.push({ registry, id: contribution.id })
    }
  }

  private registries(): Array<Map<string, RegisteredContribution<any>>> {
    return [
      this.commands,
      this.visualProviders,
      this.agentProviders,
      this.nodeExecutors,
      this.backgroundWorkers,
    ]
  }
}
