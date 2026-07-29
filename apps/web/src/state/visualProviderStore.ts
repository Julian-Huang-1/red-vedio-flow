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
  providerOptions: Record<string, Record<string, unknown>>
  status: VisualProviderStatus
  error?: string
  applyResponse: (response: VisualModelListResponse) => void
  setQueryStatus: (status: VisualProviderStatus, error?: string) => void
  selectProvider: (nodeKind: VisualNodeKind, providerId: string) => void
  setProviderOption: (providerId: string, name: string, value: unknown) => void
}

export const useVisualProviderStore = create<VisualProviderState>((set, get) => ({
  providers: [],
  selectedProviderIds: {},
  providerOptions: {},
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

    const providerOptions = { ...get().providerOptions }
    for (const provider of response.models) {
      providerOptions[provider.id] = {
        ...visualProviderDefaults(provider),
        ...providerOptions[provider.id],
      }
    }
    set({
      providers: response.models,
      providerOptions,
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
  setProviderOption: (providerId, name, value) =>
    set((state) => ({
      providerOptions: {
        ...state.providerOptions,
        [providerId]: {
          ...state.providerOptions[providerId],
          [name]: value,
        },
      },
    })),
}))

export function supportsVisualNodeKind(provider: VisualModel, nodeKind: VisualNodeKind) {
  const supportedCapabilities = nodeKind === 'image'
    ? ['text-to-image', 'image-to-image']
    : ['text-to-video', 'image-to-video', 'frames-to-video']
  return provider.capabilities.some((capability) => supportedCapabilities.includes(capability))
}

export type VisualProviderOptionDefinition = {
  name: string
  title: string
  type: 'string' | 'integer' | 'number' | 'boolean'
  enum?: unknown[]
  enumNames?: string[]
  minimum?: number
  maximum?: number
  default?: unknown
}

export function visualProviderOptionDefinitions(
  provider: VisualModel | undefined,
): VisualProviderOptionDefinition[] {
  const schema = provider?.optionsSchema
  if (!isRecord(schema) || !isRecord(schema.properties)) return []
  return Object.entries(schema.properties).flatMap(([name, value]) => {
    if (!isRecord(value)) return []
    const type = value.type
    if (!['string', 'integer', 'number', 'boolean'].includes(String(type))) return []
    return [{
      name,
      title: typeof value.title === 'string' ? value.title : name,
      type: type as VisualProviderOptionDefinition['type'],
      enum: Array.isArray(value.enum) ? value.enum : undefined,
      enumNames: Array.isArray(value.enumNames) ? value.enumNames.map(String) : undefined,
      minimum: typeof value.minimum === 'number' ? value.minimum : undefined,
      maximum: typeof value.maximum === 'number' ? value.maximum : undefined,
      default: value.default,
    }]
  })
}

function visualProviderDefaults(provider: VisualModel) {
  return Object.fromEntries(
    visualProviderOptionDefinitions(provider)
      .filter((definition) => definition.default !== undefined)
      .map((definition) => [definition.name, definition.default]),
  )
}

function isRecord(value: unknown): value is Record<string, any> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}
