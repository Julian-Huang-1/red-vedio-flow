import { useSyncExternalStore } from 'react'
import { frontendExtensions } from './host'

export function useExtensionSlot(slot: string) {
  const { ui } = frontendExtensions.registries
  useSyncExternalStore(ui.subscribe, ui.getSnapshot, ui.getSnapshot)

  return ui
    .list()
    .filter((contribution) => contribution.slot === slot)
    .sort((left, right) => left.order - right.order || left.id.localeCompare(right.id))
}
