import { create } from 'zustand'
import type {
  VisualModel,
  VisualModelListResponse,
} from '@red-video-flow/workflow-client'

type VisualProviderStatus = 'idle' | 'loading' | 'ready' | 'error'
export type VisualNodeKind = 'image' | 'video'

type VisualProviderState = {
  providers: VisualModel[]
  selectedProviderIds: Partial<Record<VisualNodeKind, string>>
  status: VisualProviderStatus
  error?: string
  applyResponse: (response: VisualModelListResponse) => void
  setQueryStatus: (status: VisualProviderStatus, error?: string) => void
  selectProvider: (nodeKind: VisualNodeKind, providerId: string) => void
}

export const useVisualProviderStore = create<VisualProviderState>((set, get) => ({
  providers: [],
  selectedProviderIds: {},
  status: 'idle',
  error: undefined,

  applyResponse: (response) => {
    const current = get().selectedProviderIds
    const selectFor = (nodeKind: VisualNodeKind) => {
      const selectedProviderId = current[nodeKind]
      const selectedStillAvailable = response.models.some(
        (provider) =>
          provider.id === selectedProviderId
          && provider.invokable
          && supportsVisualNodeKind(provider, nodeKind),
      )
      return selectedStillAvailable
        ? selectedProviderId
        : response.models.find(
            (provider) => provider.invokable && supportsVisualNodeKind(provider, nodeKind),
          )?.id
    }

    set({
      providers: response.models,
      selectedProviderIds: {
        image: selectFor('image'),
        video: selectFor('video'),
      },
      status: 'ready',
      error: undefined,
    })
  },
  setQueryStatus: (status, error) => set({ status, error }),
  selectProvider: (nodeKind, providerId) =>
    set((state) => ({
      selectedProviderIds: {
        ...state.selectedProviderIds,
        [nodeKind]: providerId,
      },
    })),
}))

export function supportsVisualNodeKind(provider: VisualModel, nodeKind: VisualNodeKind) {
  const supportedCapabilities = nodeKind === 'image'
    ? ['text-to-image', 'image-to-image']
    : ['text-to-video', 'image-to-video', 'frames-to-video']
  return provider.capabilities.some((capability) => supportedCapabilities.includes(capability))
}
