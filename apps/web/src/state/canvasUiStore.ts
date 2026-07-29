import type { XYPosition } from '@xyflow/react'
import { create } from 'zustand'
import type { AddNodeMenuState } from '../workflowPresentation'

export type CanvasPanel = string
export type WorkspacePanel = string

const closedAddNodeMenu: AddNodeMenuState = {
  open: false,
  screenX: 0,
  screenY: 0,
  flowX: 0,
  flowY: 0,
}

type NodeInteractionState = {
  selectedNodeId?: string
  editingNodeId?: string
  composerNodeId?: string
}

type CanvasUiState = NodeInteractionState & {
  activeCanvasPanel?: CanvasPanel
  openWorkspacePanels: WorkspacePanel[]
  addNodeMenu: AddNodeMenuState
  setNodeInteraction: (state: NodeInteractionState) => void
  openAddNodeMenu: (screen: XYPosition, flow: XYPosition) => void
  closeAddNodeMenu: () => void
  closeComposer: () => void
  toggleCanvasPanel: (panel: CanvasPanel) => void
  closeCanvasPanel: () => void
  toggleWorkspacePanel: (panel: WorkspacePanel) => void
  closeWorkspacePanel: (panel?: WorkspacePanel) => void
  reset: () => void
}

export const useCanvasUiStore = create<CanvasUiState>((set, get) => ({
  selectedNodeId: undefined,
  editingNodeId: undefined,
  composerNodeId: undefined,
  activeCanvasPanel: undefined,
  openWorkspacePanels: [],
  addNodeMenu: closedAddNodeMenu,

  setNodeInteraction: (state) => set(state),
  openAddNodeMenu: (screen, flow) =>
    set({
      addNodeMenu: {
        open: true,
        screenX: screen.x,
        screenY: screen.y,
        flowX: flow.x,
        flowY: flow.y,
      },
      activeCanvasPanel: undefined,
    }),
  closeAddNodeMenu: () => set({ addNodeMenu: closedAddNodeMenu }),
  closeComposer: () => set({ composerNodeId: undefined }),
  toggleCanvasPanel: (panel) =>
    set({
      activeCanvasPanel: get().activeCanvasPanel === panel ? undefined : panel,
      addNodeMenu: closedAddNodeMenu,
    }),
  closeCanvasPanel: () => set({ activeCanvasPanel: undefined }),
  toggleWorkspacePanel: (panel) => {
    const openPanels = get().openWorkspacePanels
    set({
      openWorkspacePanels: openPanels.includes(panel)
        ? openPanels.filter((item) => item !== panel)
        : [...openPanels, panel],
      activeCanvasPanel: undefined,
      addNodeMenu: closedAddNodeMenu,
    })
  },
  closeWorkspacePanel: (panel) =>
    set({
      openWorkspacePanels: panel
        ? get().openWorkspacePanels.filter((item) => item !== panel)
        : [],
    }),
  reset: () =>
    set({
      selectedNodeId: undefined,
      editingNodeId: undefined,
      composerNodeId: undefined,
      activeCanvasPanel: undefined,
      openWorkspacePanels: [],
      addNodeMenu: closedAddNodeMenu,
    }),
}))

export function resetCanvasUiState() {
  useCanvasUiStore.getState().reset()
}
