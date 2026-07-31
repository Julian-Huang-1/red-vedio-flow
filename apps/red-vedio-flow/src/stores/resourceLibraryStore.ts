import { create } from 'zustand'
import type { ResourceKind, ResourceSource } from '@red-video-flow/workflow-core'

export type ResourceAddTarget = {
  nodeId: string
  type: 'node-result' | 'composer-attachment'
}

type ResourceLibraryStore = {
  open: boolean
  scope: 'all' | 'workspace'
  kind?: ResourceKind
  source?: ResourceSource
  query: string
  selectedResourceId?: string
  addTarget?: ResourceAddTarget
  openLibrary: () => void
  closeLibrary: () => void
  setScope: (scope: 'all' | 'workspace') => void
  setKind: (kind?: ResourceKind) => void
  setSource: (source?: ResourceSource) => void
  setQuery: (query: string) => void
  selectResource: (selectedResourceId?: string) => void
  setAddTarget: (addTarget?: ResourceAddTarget) => void
}

export const useResourceLibraryStore = create<ResourceLibraryStore>((set) => ({
  open: false,
  scope: 'workspace',
  query: '',
  openLibrary: () => set({ open: true }),
  closeLibrary: () => set({ open: false }),
  setScope: (scope) => set({ scope }),
  setKind: (kind) => set({ kind }),
  setSource: (source) => set({ source }),
  setQuery: (query) => set({ query }),
  selectResource: (selectedResourceId) => set({ selectedResourceId }),
  setAddTarget: (addTarget) => set({ addTarget }),
}))
