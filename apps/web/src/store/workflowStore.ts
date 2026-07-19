import {
  addEdge,
  applyEdgeChanges,
  applyNodeChanges,
  type Connection,
  type Edge,
  type EdgeChange,
  type NodeChange,
  type XYPosition,
} from '@xyflow/react'
import { create } from 'zustand'
import {
  canConnectMaterialNodes,
  getUpstreamNodes,
  hasMaterialValue,
  type AgentStatus,
  type LocalAgent,
  type MaterialType,
  type WorkflowDocument,
  type WorkflowPatchOperation,
} from '@red-video-flow/workflow-core'
import {
  fetchWorkflow,
  patchWorkflow,
  runNodeWithAgent,
  runVisualNode,
  uploadAsset,
  type AgentListResponse,
} from '@red-video-flow/workflow-client'
import { runWorkflowNode } from '@red-video-flow/workflow-runtime'
import { createFlowNode, toFlowNode, toMaterialNode, type AddNodeMenuState, type FlowNode } from '../workflowPresentation'

type PersistenceStatus = 'idle' | 'loading' | 'saving' | 'saved' | 'error'
type WorkflowListStatus = 'idle' | 'loading' | 'ready' | 'error'
export type CanvasPanel = 'toolbox' | 'assets' | 'characters' | 'history' | 'shortcuts'
export type WorkspacePanel = 'agent' | 'assetManager'

type WorkflowStore = {
  nodes: FlowNode[]
  edges: Edge[]
  selectedNodeId?: string
  editingNodeId?: string
  composerNodeId?: string
  agents: LocalAgent[]
  selectedAgentId?: string
  agentStatus: AgentStatus
  agentError?: string
  workflowId: string
  workflowTitle: string
  workflowRevision: number
  workflows: WorkflowDocument[]
  workflowListStatus: WorkflowListStatus
  workflowListError?: string
  hasLoadedWorkflow: boolean
  persistenceStatus: PersistenceStatus
  persistenceError?: string
  activeCanvasPanel?: CanvasPanel
  openWorkspacePanels: WorkspacePanel[]
  addNodeMenu: AddNodeMenuState
  onNodesChange: (changes: NodeChange[]) => void
  onEdgesChange: (changes: EdgeChange[]) => void
  connectNodes: (connection: Connection) => void
  openAddNodeMenu: (screen: { x: number; y: number }, flow: XYPosition) => void
  closeAddNodeMenu: () => void
  toggleCanvasPanel: (panel: CanvasPanel) => void
  closeCanvasPanel: () => void
  toggleWorkspacePanel: (panel: WorkspacePanel) => void
  closeWorkspacePanel: (panel?: WorkspacePanel) => void
  createNode: (materialType: MaterialType, position?: XYPosition) => void
  selectNode: (nodeId?: string) => void
  closeComposer: () => void
  beginEditNode: (nodeId: string) => void
  attachFileToNode: (nodeId: string, file: File) => void
  updateTextNode: (nodeId: string, text: string) => void
  applyAgentsResponse: (response: AgentListResponse) => void
  setAgentQueryStatus: (status: AgentStatus, error?: string) => void
  selectAgent: (agentId: string) => void
  runNode: (nodeId: string, prompt: string, agentId?: string) => Promise<void>
  applyWorkflowList: (workflows: WorkflowDocument[]) => void
  setWorkflowListQueryStatus: (status: WorkflowListStatus, error?: string) => void
  applyWorkflow: (document: WorkflowDocument) => void
  applySavedWorkflow: (document: WorkflowDocument) => void
  resetWorkflow: () => void
  setPersistenceQueryStatus: (status: PersistenceStatus, error?: string) => void
}

const initialMenu: AddNodeMenuState = {
  open: false,
  screenX: 0,
  screenY: 0,
  flowX: 0,
  flowY: 0,
}

let workflowPatchQueue = Promise.resolve()

export const useWorkflowStore = create<WorkflowStore>((set, get) => {
  const applyRemoteWorkflow = (document: WorkflowDocument) => {
    set({
      workflowId: document.id,
      workflowTitle: document.title,
      workflowRevision: document.revision,
      nodes: document.graph.nodes.map(toFlowNode),
      edges: document.graph.edges,
      workflows: get().workflows.map((workflow) => (workflow.id === document.id ? document : workflow)),
      persistenceStatus: 'saved',
    })
  }

  const commitWorkflowPatch = async (ops: WorkflowPatchOperation[]) => {
    const { workflowId, workflowRevision, hasLoadedWorkflow } = get()
    if (!hasLoadedWorkflow || !ops.length) return undefined

    set({ persistenceStatus: 'saving', persistenceError: undefined })
    const response = await patchWorkflow(workflowId, { baseRevision: workflowRevision, ops })
    set({
      workflowTitle: response.workflow.title,
      workflowRevision: response.workflow.revision,
      workflows: get().workflows.map((workflow) => (workflow.id === response.workflow.id ? response.workflow : workflow)),
      persistenceStatus: 'saved',
    })
    return response.workflow
  }

  const enqueueWorkflowPatch = (ops: WorkflowPatchOperation[]) => {
    if (!ops.length) return Promise.resolve(undefined)

    const task = workflowPatchQueue.then(() => commitWorkflowPatch(ops))
    workflowPatchQueue = task.then(
      () => undefined,
      (error) => {
        set({
          persistenceStatus: 'error',
          persistenceError: error instanceof Error ? error.message : String(error),
        })
      },
    )
    return task.catch((error) => {
      set({
        persistenceStatus: 'error',
        persistenceError: error instanceof Error ? error.message : String(error),
      })
      return undefined
    })
  }

  const refreshIfAgentPatchedNode = async (nodeId: string, baseRevision: number) => {
    const currentWorkflowId = get().workflowId
    const currentNode = get().nodes.find((node) => node.id === nodeId)
    if (!currentNode) return false

    try {
      const document = await fetchWorkflow(currentWorkflowId)
      if (document.revision <= baseRevision) return false

      const remoteNode = document.graph.nodes.find((node) => node.id === nodeId)
      if (!remoteNode) return false

      const messageCountChanged = remoteNode.data.messages.length > currentNode.data.messages.length
      const statusChangedFromRunning = remoteNode.data.status !== 'running'
      const valueChanged = JSON.stringify(remoteNode.data.value) !== JSON.stringify(currentNode.data.value)
      const agentPatchedNode = messageCountChanged || statusChangedFromRunning || valueChanged
      if (!agentPatchedNode) return false

      applyRemoteWorkflow(document)
      return true
    } catch (error) {
      set({
        persistenceStatus: 'error',
        persistenceError: error instanceof Error ? error.message : String(error),
      })
      return false
    }
  }

  return {
  nodes: [],
  edges: [],
  selectedNodeId: undefined,
  editingNodeId: undefined,
  composerNodeId: undefined,
  agents: [],
  selectedAgentId: undefined,
  agentStatus: 'idle',
  agentError: undefined,
  workflowId: 'default',
  workflowTitle: '默认工作流',
  workflowRevision: 0,
  workflows: [],
  workflowListStatus: 'idle',
  workflowListError: undefined,
  hasLoadedWorkflow: false,
  persistenceStatus: 'idle',
  persistenceError: undefined,
  activeCanvasPanel: undefined,
  openWorkspacePanels: [],
  addNodeMenu: initialMenu,

  onNodesChange: (changes) => {
    const currentNodes = get().nodes
    const nextNodes = applyNodeChanges(changes, currentNodes) as FlowNode[]
    const ops: WorkflowPatchOperation[] = []

    for (const change of changes) {
      if (change.type === 'remove') {
        ops.push({ type: 'removeNode', nodeId: change.id })
      }
      if (change.type === 'position' && change.position && !change.dragging) {
        ops.push({ type: 'moveNode', nodeId: change.id, position: change.position })
      }
      if (change.type === 'dimensions') {
        const node = nextNodes.find((item) => item.id === change.id)
        if (node?.width && node.height) {
          ops.push({ type: 'resizeNode', nodeId: change.id, size: { width: node.width, height: node.height } })
        }
      }
    }

    set({ nodes: nextNodes })
    enqueueWorkflowPatch(ops)
  },

  onEdgesChange: (changes) => {
    const currentEdges = get().edges
    set({ edges: applyEdgeChanges(changes, get().edges) })
    enqueueWorkflowPatch(
      changes
        .filter((change) => change.type === 'remove')
        .map((change) => {
          const edge = currentEdges.find((item) => item.id === change.id)
          return { type: 'removeEdge', edgeId: change.id, source: edge?.source, target: edge?.target }
        }),
    )
  },

  connectNodes: (connection) => {
    const { nodes, edges } = get()
    const source = nodes.find((node) => node.id === connection.source)
    const target = nodes.find((node) => node.id === connection.target)

    if (!source || !target || source.id === target.id) return
    if (!canConnectMaterialNodes(source, target)) return

    const edge = {
      ...connection,
      id: `edge-${source.id}-${target.id}-${Date.now()}`,
      source: source.id,
      target: target.id,
      animated: true,
      style: { stroke: '#9fb4c9' },
    }

    set({ edges: addEdge(edge, edges) })
    enqueueWorkflowPatch([{ type: 'addEdge', edge: { id: edge.id, source: edge.source, target: edge.target } }])
  },

  openAddNodeMenu: (screen, flow) => {
    set({
      addNodeMenu: {
        open: true,
        screenX: screen.x,
        screenY: screen.y,
        flowX: flow.x,
        flowY: flow.y,
      },
      activeCanvasPanel: undefined,
    })
  },

  closeAddNodeMenu: () => {
    set({ addNodeMenu: initialMenu })
  },

  toggleCanvasPanel: (panel) => {
    set({
      activeCanvasPanel: get().activeCanvasPanel === panel ? undefined : panel,
      addNodeMenu: initialMenu,
    })
  },

  closeCanvasPanel: () => {
    set({ activeCanvasPanel: undefined })
  },

  toggleWorkspacePanel: (panel) => {
    const openPanels = get().openWorkspacePanels
    set({
      openWorkspacePanels: openPanels.includes(panel)
        ? openPanels.filter((item) => item !== panel)
        : [...openPanels, panel],
      activeCanvasPanel: undefined,
      addNodeMenu: initialMenu,
    })
  },

  closeWorkspacePanel: (panel) => {
    set({
      openWorkspacePanels: panel
        ? get().openWorkspacePanels.filter((item) => item !== panel)
        : [],
    })
  },

  createNode: (materialType, position) => {
    const menu = get().addNodeMenu
    const node = createFlowNode(materialType, position ?? { x: menu.flowX, y: menu.flowY })

    set({
      nodes: [...get().nodes, node],
      selectedNodeId: node.id,
      editingNodeId: undefined,
      composerNodeId: undefined,
      activeCanvasPanel: undefined,
      addNodeMenu: initialMenu,
    })
    enqueueWorkflowPatch([{ type: 'addNode', node: toMaterialNode(node) }])
  },

  selectNode: (nodeId) => {
    const editingNodeId = get().editingNodeId
    const node = get().nodes.find((item) => item.id === nodeId)
    const canShowComposer = node ? !hasMaterialValue(node) : false
    set({
      selectedNodeId: nodeId,
      editingNodeId: nodeId && editingNodeId === nodeId ? editingNodeId : undefined,
      composerNodeId: canShowComposer ? nodeId : undefined,
      activeCanvasPanel: undefined,
      addNodeMenu: initialMenu,
    })
  },

  closeComposer: () => {
    set({ composerNodeId: undefined })
  },

  beginEditNode: (nodeId) => {
    set({ selectedNodeId: nodeId, editingNodeId: nodeId, composerNodeId: undefined, addNodeMenu: initialMenu })
  },

  attachFileToNode: (nodeId, file) => {
    const previewUrl = URL.createObjectURL(file)

    set({
      nodes: get().nodes.map((node) => {
        if (node.id !== nodeId) return node

        return {
          ...node,
          data: {
            ...node.data,
            status: 'ready',
            value: {
              url: previewUrl,
              fileName: file.name,
              mimeType: file.type,
            },
          },
        }
      }),
      selectedNodeId: nodeId,
    })

    void uploadAsset(file)
      .then((asset) => {
        set({
          nodes: get().nodes.map((node) => {
            if (node.id !== nodeId) return node
            const value = {
              ...node.data.value,
              url: asset.url,
              localPath: asset.localPath,
              fileName: asset.fileName,
            }
            return {
              ...node,
              data: {
                ...node.data,
                value,
              },
            }
          }),
        })
        const node = get().nodes.find((item) => item.id === nodeId)
        if (node) {
          enqueueWorkflowPatch([
            { type: 'setNodeStatus', nodeId, status: 'ready' },
            { type: 'setNodeValue', nodeId, value: node.data.value },
          ])
        }
      })
      .catch((error) => {
        const errorMessage = {
          id: `msg-${Date.now()}-upload-error`,
          role: 'assistant' as const,
          text: `素材落盘失败：${error instanceof Error ? error.message : String(error)}`,
          createdAt: Date.now(),
        }
        set({
          nodes: get().nodes.map((node) => {
            if (node.id !== nodeId) return node
            return {
              ...node,
              data: {
                ...node.data,
                status: 'error',
                messages: [
                  ...node.data.messages,
                  errorMessage,
                ],
              },
            }
          }),
        })
        enqueueWorkflowPatch([
          { type: 'setNodeStatus', nodeId, status: 'error' },
          { type: 'appendNodeMessage', nodeId, message: errorMessage },
        ])
      })
  },

  updateTextNode: (nodeId, text) => {
    const status = text.trim() ? 'ready' : 'empty'
    set({
      nodes: get().nodes.map((node) => {
        if (node.id !== nodeId) return node

        return {
          ...node,
          data: {
            ...node.data,
            status,
            value: { text },
          },
        }
      }),
    })
    enqueueWorkflowPatch([
      { type: 'setNodeStatus', nodeId, status },
      { type: 'setNodeValue', nodeId, value: { text } },
    ])
  },

  applyAgentsResponse: (response) => {
    const invokable = response.agents.find((agent) => agent.invokable)
    const currentSelected = get().selectedAgentId
    const stillAvailable = response.agents.some((agent) => agent.id === currentSelected && agent.invokable)

    set({
      agents: response.agents,
      selectedAgentId: stillAvailable ? currentSelected : invokable?.id,
      agentStatus: 'ready',
      agentError: undefined,
    })
  },

  setAgentQueryStatus: (status, error) => {
    set({ agentStatus: status, agentError: error })
  },

  selectAgent: (agentId) => {
    set({ selectedAgentId: agentId })
  },

  applyWorkflowList: (workflows) => {
    set({ workflows, workflowListStatus: 'ready', workflowListError: undefined })
  },

  setWorkflowListQueryStatus: (status, error) => {
    set({ workflowListStatus: status, workflowListError: error })
  },

  applyWorkflow: (document) => {
    set({
      workflowId: document.id,
      workflowTitle: document.title,
      workflowRevision: document.revision,
      nodes: document.graph.nodes.map(toFlowNode),
      edges: document.graph.edges,
      selectedNodeId: undefined,
      editingNodeId: undefined,
      composerNodeId: undefined,
      activeCanvasPanel: undefined,
      openWorkspacePanels: [],
      addNodeMenu: initialMenu,
      hasLoadedWorkflow: true,
      persistenceStatus: 'saved',
      persistenceError: undefined,
      workflows: [document, ...get().workflows.filter((workflow) => workflow.id !== document.id)],
      workflowListStatus: 'ready',
    })
  },

  applySavedWorkflow: (document) => {
    set({
      workflowTitle: document.title,
      workflowRevision: document.revision,
      workflows: get().workflows.map((workflow) => (workflow.id === document.id ? document : workflow)),
      persistenceStatus: 'saved',
      persistenceError: undefined,
    })
  },

  resetWorkflow: () => {
    set({
      workflowId: 'default',
      workflowTitle: '默认工作流',
      workflowRevision: 0,
      nodes: [],
      edges: [],
      selectedNodeId: undefined,
      editingNodeId: undefined,
      composerNodeId: undefined,
      activeCanvasPanel: undefined,
      openWorkspacePanels: [],
      addNodeMenu: initialMenu,
      hasLoadedWorkflow: false,
      persistenceStatus: 'saved',
    })
  },

  setPersistenceQueryStatus: (status, error) => {
    set({ persistenceStatus: status, persistenceError: error })
  },

  runNode: async (nodeId, prompt, agentId) => {
    const { nodes, edges, selectedAgentId, agents } = get()
    const target = nodes.find((node) => node.id === nodeId)
    if (!target || !prompt.trim()) return

    const upstream = getUpstreamNodes(nodes, edges, nodeId)
    const userMessage = {
      id: `msg-${Date.now()}`,
      role: 'user' as const,
      text: prompt,
      createdAt: Date.now(),
    }

    set({
      nodes: nodes.map((node) =>
        node.id === nodeId
          ? {
              ...node,
              data: {
                ...node.data,
                status: 'running',
                messages: [...node.data.messages, userMessage],
              },
            }
          : node,
      ),
    })
    const startWorkflow = await enqueueWorkflowPatch([
      { type: 'setNodeStatus', nodeId, status: 'running' },
      { type: 'appendNodeMessage', nodeId, message: userMessage },
    ])
    const agentBaseRevision = startWorkflow?.revision ?? get().workflowRevision

    const selectedAgent = agents.find((agent) => agent.id === (agentId ?? selectedAgentId) && agent.invokable)
    const result = await runWorkflowNode(
      {
        node: target,
        upstream,
        edges,
        prompt,
        selectedAgent,
        workflowId: get().workflowId,
        workflowRevision: agentBaseRevision,
      },
      {
        runTextAgent: runNodeWithAgent,
        runVisualModel: runVisualNode,
      },
    )

    if (selectedAgent && (await refreshIfAgentPatchedNode(nodeId, agentBaseRevision))) return

    const assistantMessage = {
      id: `msg-${Date.now()}-assistant`,
      role: 'assistant' as const,
      text: result.assistantMessage,
      createdAt: Date.now(),
    }

    set({
      nodes: get().nodes.map((node) => {
        if (node.id !== nodeId) return node

        return {
          ...node,
          data: {
            ...node.data,
            status: result.status,
            value: result.value,
            messages: [
              ...node.data.messages,
              assistantMessage,
            ],
          },
        }
      }),
    })
    enqueueWorkflowPatch([
      { type: 'setNodeStatus', nodeId, status: result.status },
      { type: 'setNodeValue', nodeId, value: result.value },
      {
        type: 'appendNodeMessage',
        nodeId,
        message: assistantMessage,
      },
    ])
  },
  }
})
