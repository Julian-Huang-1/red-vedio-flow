import type { HtmlArtifact } from './htmlArtifact'

export interface ArtifactRepository {
  get(sessionId: string): HtmlArtifact | undefined
  save(artifact: HtmlArtifact): void
  remove(sessionId: string): void
  clear(): void
}

export function createMemoryArtifactRepository(): ArtifactRepository {
  const artifacts = new Map<string, HtmlArtifact>()
  return {
    get: (sessionId) => artifacts.get(sessionId),
    save: (artifact) => artifacts.set(artifact.sessionId, artifact),
    remove: (sessionId) => artifacts.delete(sessionId),
    clear: () => artifacts.clear(),
  }
}
