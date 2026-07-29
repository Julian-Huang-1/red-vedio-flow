import { EventEmitter } from 'node:events'
import {
  PLUGIN_API_VERSION,
  redactPluginValue,
  sanitizePluginManifest,
  type PluginDescriptor,
  type PluginStatus,
} from '@red-video-flow/plugin-contract'
import { ContributionRegistry } from './contributionRegistry.js'
import {
  discoverPlugins,
  type DiscoveredPlugin,
  type PluginDiscoveryError,
} from './discovery.js'
import { PluginProcessHost, type PluginProcessHostOptions } from './processHost.js'

export type PluginManagerOptions = PluginProcessHostOptions & {
  pluginDirs: string[]
  autoActivate?: boolean
}

type ManagedPlugin = DiscoveredPlugin & {
  status: PluginStatus
  error?: string
  host?: PluginProcessHost
  removeNotificationListener?: () => void
  removeExitListener?: () => void
  startedWorkers?: Set<string>
}

export class PluginManager {
  readonly contributions = new ContributionRegistry()
  private readonly plugins = new Map<string, ManagedPlugin>()
  private readonly events = new EventEmitter()
  private discoveryErrors: PluginDiscoveryError[] = []
  private started = false

  constructor(private readonly options: PluginManagerOptions) {
    this.events.setMaxListeners(0)
  }

  async start() {
    if (this.started) return
    try {
      this.discover()
      if (this.options.autoActivate !== false) {
        for (const pluginId of this.plugins.keys()) await this.activate(pluginId)
      }
      this.started = true
    } catch (error) {
      await this.close()
      throw error
    }
  }

  discover() {
    if ([...this.plugins.values()].some((plugin) => plugin.status === 'active' || plugin.status === 'starting')) {
      throw new Error('cannot rediscover plugins while plugins are active')
    }
    this.plugins.clear()
    const result = discoverPlugins(this.options.pluginDirs)
    this.discoveryErrors = result.errors
    for (const plugin of result.plugins) {
      this.plugins.set(plugin.manifest.id, { ...plugin, status: 'discovered' })
    }
    return result
  }

  async activate(pluginId: string) {
    const plugin = this.requirePlugin(pluginId)
    if (plugin.status === 'active') return
    if (plugin.status === 'starting') throw new Error(`plugin is already starting: ${pluginId}`)
    plugin.status = 'starting'
    plugin.error = undefined

    const host = new PluginProcessHost(plugin.manifest, plugin.directory, {
      requestTimeoutMs: this.options.requestTimeoutMs,
      shutdownGraceMs: this.options.shutdownGraceMs,
      onStderr: (message) => this.options.onStderr?.(`[${pluginId}] ${message}`),
    })
    plugin.host = host
    plugin.removeNotificationListener = host.onNotification((method, params) => {
      this.events.emit('notification', {
        pluginId,
        method,
        params: redactPluginValue(params, plugin.manifest),
      })
    })
    plugin.removeExitListener = host.onExit((event) => {
      if (plugin.status !== 'stopping' && plugin.status !== 'inactive') {
        this.contributions.unregister(pluginId)
        plugin.status = 'failed'
        plugin.error = `plugin process exited code=${String(event.code)} signal=${String(event.signal)}`
      }
    })

    try {
      host.start()
      await host.call('plugin.initialize', {
        pluginId,
        apiVersion: PLUGIN_API_VERSION,
      })
      await host.call('plugin.activate')
      this.contributions.register(pluginId, plugin.manifest.contributes)
      plugin.startedWorkers = new Set()
      for (const worker of plugin.manifest.contributes?.backgroundWorkers ?? []) {
        if (!worker.autoStart) continue
        await host.call('worker.start', {
          contributionId: worker.id,
          input: {},
        })
        plugin.startedWorkers.add(worker.id)
      }
      plugin.status = 'active'
    } catch (error) {
      this.contributions.unregister(pluginId)
      plugin.status = 'failed'
      plugin.error = error instanceof Error ? error.message : String(error)
      await host.stop().catch(() => undefined)
      plugin.removeNotificationListener?.()
      plugin.removeExitListener?.()
      plugin.host = undefined
      plugin.startedWorkers = undefined
    }
  }

  async deactivate(pluginId: string) {
    const plugin = this.requirePlugin(pluginId)
    if (!plugin.host) {
      plugin.status = 'inactive'
      return
    }
    plugin.status = 'stopping'
    this.contributions.unregister(pluginId)
    for (const workerId of plugin.startedWorkers ?? []) {
      try {
        await plugin.host.call('worker.stop', { contributionId: workerId })
      } catch {}
    }
    try {
      if (plugin.host.running) await plugin.host.call('plugin.deactivate')
    } catch {}
    await plugin.host.stop()
    plugin.removeNotificationListener?.()
    plugin.removeExitListener?.()
    plugin.host = undefined
    plugin.startedWorkers = undefined
    plugin.status = 'inactive'
  }

  async reload(pluginId: string) {
    await this.deactivate(pluginId)
    const current = this.requirePlugin(pluginId)
    const discovered = discoverPlugins(this.options.pluginDirs)
    this.discoveryErrors = discovered.errors
    const replacement = discovered.plugins.find((plugin) => plugin.manifest.id === pluginId)
    if (!replacement) {
      this.plugins.delete(pluginId)
      throw new Error(`plugin disappeared during reload: ${pluginId}`)
    }
    this.plugins.set(pluginId, { ...replacement, status: 'discovered' })
    await this.activate(pluginId)
    return this.describe(pluginId)
  }

  async call<T = unknown>(pluginId: string, method: string, params?: unknown, timeoutMs?: number) {
    const plugin = this.requirePlugin(pluginId)
    if (plugin.status !== 'active' || !plugin.host) {
      throw new Error(`plugin is not active: ${pluginId}`)
    }
    return plugin.host.call<T>(method, params, timeoutMs)
  }

  async health(pluginId: string) {
    return this.call(pluginId, 'plugin.health')
  }

  async startWorker(workerId: string, input?: unknown) {
    const registered = this.contributions.getBackgroundWorker(workerId)
    if (!registered) throw new Error(`background worker not found: ${workerId}`)
    const result = await this.call(registered.pluginId, 'worker.start', {
      contributionId: workerId,
      input,
    })
    this.requirePlugin(registered.pluginId).startedWorkers?.add(workerId)
    return result
  }

  async stopWorker(workerId: string) {
    const registered = this.contributions.getBackgroundWorker(workerId)
    if (!registered) throw new Error(`background worker not found: ${workerId}`)
    const result = await this.call(registered.pluginId, 'worker.stop', {
      contributionId: workerId,
    })
    this.requirePlugin(registered.pluginId).startedWorkers?.delete(workerId)
    return result
  }

  onNotification(listener: (event: { pluginId: string; method: string; params: unknown }) => void) {
    this.events.on('notification', listener)
    return () => this.events.off('notification', listener)
  }

  list(): PluginDescriptor[] {
    return [...this.plugins.values()].map((plugin) => ({
      manifest: sanitizePluginManifest(plugin.manifest),
      status: plugin.status,
      error: plugin.error,
    }))
  }

  has(pluginId: string) {
    return this.plugins.has(pluginId)
  }

  describe(pluginId: string): PluginDescriptor {
    const plugin = this.requirePlugin(pluginId)
    return {
      manifest: sanitizePluginManifest(plugin.manifest),
      status: plugin.status,
      error: plugin.error,
    }
  }

  listDiscoveryErrors() {
    return [...this.discoveryErrors]
  }

  async close() {
    const pluginIds = [...this.plugins.keys()]
    await Promise.allSettled(pluginIds.map((pluginId) => this.deactivate(pluginId)))
    this.started = false
  }

  private requirePlugin(pluginId: string) {
    const plugin = this.plugins.get(pluginId)
    if (!plugin) throw new Error(`plugin not found: ${pluginId}`)
    return plugin
  }
}
