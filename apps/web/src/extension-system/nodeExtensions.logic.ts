import { useSyncExternalStore } from 'react'
import type { MaterialType } from '@red-video-flow/workflow-core'
import { frontendExtensions } from './host'

function useNodeRegistryRevision() {
  const registry = frontendExtensions.registries.nodeTypes
  useSyncExternalStore(registry.subscribe, registry.getSnapshot, registry.getSnapshot)
  return registry
}

export function useNodeTypeContributions() {
  return useNodeRegistryRevision()
    .list()
    .sort((left, right) =>
      (left.order ?? 0) - (right.order ?? 0) || left.title.localeCompare(right.title, 'zh-CN'),
    )
}

export function useNodeTypeContribution(materialType: MaterialType) {
  return useNodeRegistryRevision()
    .list()
    .find((definition) => definition.materialType === materialType)
}

export function getNodeTypeContribution(materialType: MaterialType) {
  return frontendExtensions.registries.nodeTypes
    .list()
    .find((definition) => definition.materialType === materialType)
}

export function useReactFlowNodeTypes() {
  const definitions = useNodeRegistryRevision().list()
  return Object.fromEntries(
    definitions.map((definition) => [definition.id, definition.component]),
  )
}
