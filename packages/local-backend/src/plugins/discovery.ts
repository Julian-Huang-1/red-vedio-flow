import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { parsePluginManifest, type PluginManifest } from '@red-video-flow/plugin-contract'

export type DiscoveredPlugin = {
  directory: string
  manifestPath: string
  manifest: PluginManifest
}

export type PluginDiscoveryError = {
  path: string
  message: string
}

export type PluginDiscoveryResult = {
  plugins: DiscoveredPlugin[]
  errors: PluginDiscoveryError[]
}

export function discoverPlugins(pluginDirs: string[]): PluginDiscoveryResult {
  const plugins: DiscoveredPlugin[] = []
  const errors: PluginDiscoveryError[] = []
  const seenIds = new Set<string>()

  for (const configuredDir of pluginDirs) {
    const pluginDir = resolve(configuredDir)
    if (!existsSync(pluginDir)) continue

    for (const entry of readdirSync(pluginDir).sort()) {
      const directory = join(pluginDir, entry)
      if (!statSync(directory).isDirectory()) continue
      const manifestPath = join(directory, 'plugin.json')
      if (!existsSync(manifestPath)) continue

      try {
        const manifest = parsePluginManifest(JSON.parse(readFileSync(manifestPath, 'utf8')))
        if (seenIds.has(manifest.id)) {
          errors.push({
            path: manifestPath,
            message: `duplicate plugin id ignored: ${manifest.id}`,
          })
          continue
        }
        seenIds.add(manifest.id)
        plugins.push({ directory, manifestPath, manifest })
      } catch (error) {
        errors.push({
          path: manifestPath,
          message: error instanceof Error ? error.message : String(error),
        })
      }
    }
  }

  return { plugins, errors }
}
