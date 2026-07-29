import { useSyncExternalStore } from 'react'
import { frontendExtensions } from './host'

export function useAgentMessageRenderers() {
  const registry = frontendExtensions.registries.messageRenderers
  useSyncExternalStore(registry.subscribe, registry.getSnapshot, registry.getSnapshot)
  return registry.list()
}
