import { useQuery } from '@tanstack/react-query'
import { fetchPluginCommands, fetchPlugins } from '@red-video-flow/workflow-client'

export const pluginQueryKeys = {
  plugins: ['plugins'] as const,
  commands: ['plugin-commands'] as const,
}

export function usePluginsQuery(enabled = true) {
  return useQuery({
    queryKey: pluginQueryKeys.plugins,
    queryFn: fetchPlugins,
    enabled,
  })
}

export function usePluginCommandsQuery(enabled = true) {
  return useQuery({
    queryKey: pluginQueryKeys.commands,
    queryFn: fetchPluginCommands,
    enabled,
  })
}
