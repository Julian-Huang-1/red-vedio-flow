import { create } from 'zustand'
import { createMemoryArtifactRepository } from './artifactRepository'
import type {
  HtmlArtifact,
  PendingHtmlArtifact,
  PreviewMode,
} from './htmlArtifact'
import { validateHtmlArtifact } from './htmlArtifactValidator'

const repository = createMemoryArtifactRepository()

type AppBuilderState = {
  artifactsBySessionId: Record<string, HtmlArtifact>
  pendingArtifactsBySessionId: Record<string, PendingHtmlArtifact>
  generatingSessionId?: string
  generationErrorsBySessionId: Record<string, string>
  previewMode: PreviewMode
  sourceOpen: boolean
  reloadKey: number
  selectedSubgraphId?: string
}

type AppBuilderActions = {
  beginGeneration: (sessionId: string) => void
  stageArtifact: (artifact: PendingHtmlArtifact) => void
  completeGeneration: (sessionId: string) => void
  failGeneration: (sessionId: string, message: string) => void
  cancelGeneration: (sessionId: string) => void
  removeArtifact: (sessionId: string) => void
  setPreviewMode: (mode: PreviewMode) => void
  setSourceOpen: (open: boolean) => void
  reloadPreview: () => void
  setSelectedSubgraphId: (subgraphId?: string) => void
  reset: () => void
}

const initialState: AppBuilderState = {
  artifactsBySessionId: {},
  pendingArtifactsBySessionId: {},
  generatingSessionId: undefined,
  generationErrorsBySessionId: {},
  previewMode: 'desktop',
  sourceOpen: false,
  reloadKey: 0,
  selectedSubgraphId: undefined,
}

export const useAppBuilderStore = create<AppBuilderState & AppBuilderActions>((set, get) => ({
  ...initialState,

  beginGeneration: (sessionId) => set((state) => ({
    generatingSessionId: sessionId,
    generationErrorsBySessionId: omitKey(state.generationErrorsBySessionId, sessionId),
    pendingArtifactsBySessionId: omitKey(state.pendingArtifactsBySessionId, sessionId),
  })),

  stageArtifact: (artifact) => set((state) => ({
    pendingArtifactsBySessionId: {
      ...state.pendingArtifactsBySessionId,
      [artifact.sessionId]: artifact,
    },
  })),

  completeGeneration: (sessionId) => {
    const state = get()
    const pending = state.pendingArtifactsBySessionId[sessionId]
    if (!pending) {
      set({
        generatingSessionId: state.generatingSessionId === sessionId
          ? undefined
          : state.generatingSessionId,
        generationErrorsBySessionId: {
          ...state.generationErrorsBySessionId,
          [sessionId]: 'Agent 本轮没有生成可预览页面。',
        },
      })
      return
    }

    const validation = validateHtmlArtifact(pending.html)
    if (!validation.valid) {
      get().failGeneration(sessionId, validation.message)
      return
    }

    const previous = state.artifactsBySessionId[sessionId] ?? repository.get(sessionId)
    const now = Date.now()
    const artifact: HtmlArtifact = {
      id: previous?.id ?? createId(),
      sessionId,
      version: (previous?.version ?? 0) + 1,
      html: validation.html,
      title: pending.title || previous?.title,
      createdAt: previous?.createdAt ?? now,
      updatedAt: now,
    }
    repository.save(artifact)
    set((current) => ({
      artifactsBySessionId: {
        ...current.artifactsBySessionId,
        [sessionId]: artifact,
      },
      pendingArtifactsBySessionId: omitKey(current.pendingArtifactsBySessionId, sessionId),
      generationErrorsBySessionId: omitKey(current.generationErrorsBySessionId, sessionId),
      generatingSessionId: current.generatingSessionId === sessionId
        ? undefined
        : current.generatingSessionId,
      reloadKey: current.reloadKey + 1,
    }))
  },

  failGeneration: (sessionId, message) => set((state) => ({
    pendingArtifactsBySessionId: omitKey(state.pendingArtifactsBySessionId, sessionId),
    generatingSessionId: state.generatingSessionId === sessionId
      ? undefined
      : state.generatingSessionId,
    generationErrorsBySessionId: {
      ...state.generationErrorsBySessionId,
      [sessionId]: message,
    },
  })),

  cancelGeneration: (sessionId) => set((state) => ({
    pendingArtifactsBySessionId: omitKey(state.pendingArtifactsBySessionId, sessionId),
    generatingSessionId: state.generatingSessionId === sessionId
      ? undefined
      : state.generatingSessionId,
  })),

  removeArtifact: (sessionId) => {
    repository.remove(sessionId)
    set((state) => ({
      artifactsBySessionId: omitKey(state.artifactsBySessionId, sessionId),
      pendingArtifactsBySessionId: omitKey(state.pendingArtifactsBySessionId, sessionId),
      generationErrorsBySessionId: omitKey(state.generationErrorsBySessionId, sessionId),
    }))
  },
  setPreviewMode: (previewMode) => set({ previewMode }),
  setSourceOpen: (sourceOpen) => set({ sourceOpen }),
  reloadPreview: () => set((state) => ({ reloadKey: state.reloadKey + 1 })),
  setSelectedSubgraphId: (selectedSubgraphId) => set({ selectedSubgraphId }),
  reset: () => {
    repository.clear()
    set({ ...initialState })
  },
}))

function createId() {
  return `artifact-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

function omitKey<T>(record: Record<string, T>, key: string) {
  const { [key]: _removed, ...remaining } = record
  return remaining
}
