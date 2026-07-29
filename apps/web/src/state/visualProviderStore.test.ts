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
      status: 'idle',
      error: undefined,
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
