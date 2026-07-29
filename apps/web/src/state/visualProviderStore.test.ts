import { beforeEach, describe, expect, it } from 'vitest'
import { useVisualProviderStore } from './visualProviderStore'

const imageProvider = {
  id: 'image-only',
  label: 'Image Provider',
  vendor: 'Test',
  available: true,
  invokable: true,
  capabilities: ['text-to-image'],
}

const videoProvider = {
  id: 'video-only',
  label: 'Video Provider',
  vendor: 'Test',
  available: true,
  invokable: true,
  capabilities: ['text-to-video'],
}

describe('visual provider store', () => {
  beforeEach(() => {
    useVisualProviderStore.setState({
      providers: [],
      selectedProviderIds: {},
      providerOptions: {},
      status: 'idle',
      error: undefined,
    })
  })

  it('initializes and updates provider options from the provider schema', () => {
    useVisualProviderStore.getState().applyResponse({
      models: [{
        ...videoProvider,
        optionsSchema: {
          type: 'object',
          properties: {
            ratio: { type: 'string', enum: ['16:9', '9:16'], default: '16:9' },
          },
        },
      }],
      installedCount: 1,
      invokableCount: 1,
    })

    expect(useVisualProviderStore.getState().providerOptions['video-only']).toEqual({
      ratio: '16:9',
    })
    useVisualProviderStore.getState().setProviderOption('video-only', 'ratio', '9:16')
    expect(useVisualProviderStore.getState().providerOptions['video-only']).toEqual({
      ratio: '9:16',
    })
  })

  it('selects providers independently for image and video nodes', () => {
    useVisualProviderStore.getState().applyResponse({
      models: [imageProvider, videoProvider],
      installedCount: 2,
      invokableCount: 2,
    })

    expect(useVisualProviderStore.getState().selectedProviderIds).toEqual({
      image: 'image-only',
      video: 'video-only',
    })
  })

  it('preserves a compatible user selection when the catalog refreshes', () => {
    useVisualProviderStore.getState().applyResponse({
      models: [
        imageProvider,
        { ...imageProvider, id: 'image-preferred', label: 'Preferred Image Provider' },
      ],
      installedCount: 2,
      invokableCount: 2,
    })
    useVisualProviderStore.getState().selectProvider('image', 'image-preferred')
    useVisualProviderStore.getState().applyResponse({
      models: [
        imageProvider,
        { ...imageProvider, id: 'image-preferred', label: 'Preferred Image Provider' },
      ],
      installedCount: 2,
      invokableCount: 2,
    })

    expect(useVisualProviderStore.getState().selectedProviderIds.image).toBe('image-preferred')
  })
})
