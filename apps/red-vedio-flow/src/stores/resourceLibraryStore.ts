import { create } from 'zustand'
import type { ResourceKind, ResourceSource } from '@red-video-flow/workflow-core'

type ResourceLibraryStore = {
  open: boolean
  kind?: ResourceKind
  source?: ResourceSource
  query: string
  selectedResourceId?: string
  openLibrary: () => void
  closeLibrary: () => void
  setKind: (kind?: ResourceKind) => void
  setSource: (source?: ResourceSource) => void
  setQuery: (query: string) => void
  selectResource: (selectedResourceId?: string) => void
}

export const useResourceLibraryStore = create<ResourceLibraryStore>((set) => ({
  open: false,
  query: '',
  openLibrary: () => set({ open: true }),
  closeLibrary: () => set({ open: false }),
  setKind: (kind) => set({ kind }),
  setSource: (source) => set({ source }),
  setQuery: (query) => set({ query }),
  selectResource: (selectedResourceId) => set({ selectedResourceId }),
}))
