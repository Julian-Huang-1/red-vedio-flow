import { describe, expect, it } from 'vitest'
import { coworkVisualModels } from './visualModels.js'

describe('coworkVisualModels', () => {
  it('exposes the image and video models consumed by the composer', () => {
    expect(coworkVisualModels.models.map((model) => ({
      id: model.id,
      pluginId: model.pluginId,
      capabilities: model.capabilities,
    }))).toEqual([
      {
        id: 'gpt-image-2',
        pluginId: 'builtin.visual-gpt-image',
        capabilities: ['text-to-image', 'image-to-image'],
      },
      {
        id: 'doubao-seedance-2',
        pluginId: 'builtin.visual-seedance',
        capabilities: ['text-to-video', 'image-to-video'],
      },
    ])
    expect(coworkVisualModels.installedCount).toBe(2)
    expect(coworkVisualModels.invokableCount).toBe(2)
  })
})
