import type { MaterialType } from './types'

export const materialTypes = ['text', 'image', 'video', 'audio'] as const satisfies readonly MaterialType[]

export const acceptedMimeTypes: Partial<Record<MaterialType, string[]>> = {
  image: ['image/png', 'image/jpeg', 'image/webp'],
  video: ['video/mp4', 'video/quicktime', 'video/webm'],
  audio: ['audio/mpeg', 'audio/mp4', 'audio/wav', 'audio/webm', 'audio/ogg'],
}

export function canUploadMaterial(materialType: MaterialType) {
  return Boolean(acceptedMimeTypes[materialType]?.length)
}
