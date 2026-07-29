import { useSyncExternalStore } from 'react'
import { frontendExtensions } from './host'

function useCanvasPanelRegistry() {
  const registry = frontendExtensions.registries.canvasPanels
  useSyncExternalStore(registry.subscribe, registry.getSnapshot, registry.getSnapshot)
  return registry
}

export function useCanvasPanelContributions() {
  return useCanvasPanelRegistry()
    .list()
    .sort((left, right) =>
      (left.order ?? 0) - (right.order ?? 0) || left.title.localeCompare(right.title, 'zh-CN'),
    )
}

export function useCanvasPanelContribution(panelId?: string) {
  const registry = useCanvasPanelRegistry()
  return panelId ? registry.get(panelId) : undefined
}
