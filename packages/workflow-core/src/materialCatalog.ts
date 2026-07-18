import type { MaterialType } from './types'

export const materialTypes = ['text', 'image', 'video'] as const satisfies readonly MaterialType[]

export const acceptedMimeTypes: Partial<Record<MaterialType, string[]>> = {
  image: ['image/png', 'image/jpeg', 'image/webp'],
  video: ['video/mp4', 'video/quicktime', 'video/webm'],
}

export function canUploadMaterial(materialType: MaterialType) {
  return Boolean(acceptedMimeTypes[materialType]?.length)
}
