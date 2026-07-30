import { create } from 'zustand'

export type WorkspaceSummary = {
  id: string
  title: string
  createdAt: number
  updatedAt: number
}

type WorkspaceStore = {
  currentWorkspaceId?: string
  workspaces: WorkspaceSummary[]
  setWorkspaces: (workspaces: WorkspaceSummary[]) => void
  openWorkspace: (workspaceId: string) => void
}

export const useWorkspaceStore = create<WorkspaceStore>((set) => ({
  workspaces: [],
  setWorkspaces: (workspaces) => set({ workspaces }),
  openWorkspace: (currentWorkspaceId) => set({ currentWorkspaceId }),
}))
