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
} from '@red-video-flow/workflow-core'
import { fetchLocalAgents, runNodeWithAgent, runVisualNode, uploadAsset } from '@red-video-flow/workflow-client'
import { runWorkflowNode } from '@red-video-flow/workflow-runtime'
import { createFlowNode, type AddNodeMenuState, type FlowNode } from '../workflowPresentation'

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
  addNodeMenu: AddNodeMenuState
  onNodesChange: (changes: NodeChange[]) => void
  onEdgesChange: (changes: EdgeChange[]) => void
  connectNodes: (connection: Connection) => void
  openAddNodeMenu: (screen: { x: number; y: number }, flow: XYPosition) => void
  closeAddNodeMenu: () => void
  createNode: (materialType: MaterialType, position?: XYPosition) => void
  selectNode: (nodeId?: string) => void
  closeComposer: () => void
  beginEditNode: (nodeId: string) => void
  attachFileToNode: (nodeId: string, file: File) => void
  updateTextNode: (nodeId: string, text: string) => void
  loadAgents: () => Promise<void>
  selectAgent: (agentId: string) => void
  runNode: (nodeId: string, prompt: string, agentId?: string) => Promise<void>
}

const initialMenu: AddNodeMenuState = {
  open: false,
  screenX: 0,
  screenY: 0,
  flowX: 0,
  flowY: 0,
}

export const useWorkflowStore = create<WorkflowStore>((set, get) => ({
  nodes: [],
  edges: [],
  selectedNodeId: undefined,
  editingNodeId: undefined,
  composerNodeId: undefined,
  agents: [],
  selectedAgentId: undefined,
  agentStatus: 'idle',
  agentError: undefined,
  addNodeMenu: initialMenu,

  onNodesChange: (changes) => {
    set({ nodes: applyNodeChanges(changes, get().nodes) as FlowNode[] })
  },

  onEdgesChange: (changes) => {
    set({ edges: applyEdgeChanges(changes, get().edges) })
  },

  connectNodes: (connection) => {
    const { nodes, edges } = get()
    const source = nodes.find((node) => node.id === connection.source)
    const target = nodes.find((node) => node.id === connection.target)

    if (!source || !target || source.id === target.id) return
    if (!canConnectMaterialNodes(source, target)) return

    set({
      edges: addEdge(
        {
          ...connection,
          animated: true,
          style: { stroke: '#9fb4c9' },
        },
        edges,
      ),
    })
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
    })
  },

  closeAddNodeMenu: () => {
    set({ addNodeMenu: initialMenu })
  },

  createNode: (materialType, position) => {
    const menu = get().addNodeMenu
    const node = createFlowNode(materialType, position ?? { x: menu.flowX, y: menu.flowY })

    set({
      nodes: [...get().nodes, node],
      selectedNodeId: node.id,
      editingNodeId: undefined,
      composerNodeId: undefined,
      addNodeMenu: initialMenu,
    })
  },

  selectNode: (nodeId) => {
    const editingNodeId = get().editingNodeId
    const node = get().nodes.find((item) => item.id === nodeId)
    const canShowComposer = node ? !hasMaterialValue(node) : false
    set({
      selectedNodeId: nodeId,
      editingNodeId: nodeId && editingNodeId === nodeId ? editingNodeId : undefined,
      composerNodeId: canShowComposer ? nodeId : undefined,
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
            return {
              ...node,
              data: {
                ...node.data,
                value: {
                  ...node.data.value,
                  url: asset.url,
                  localPath: asset.localPath,
                  fileName: asset.fileName,
                },
              },
            }
          }),
        })
      })
      .catch((error) => {
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
                  {
                    id: `msg-${Date.now()}-upload-error`,
                    role: 'assistant',
                    text: `素材落盘失败：${error instanceof Error ? error.message : String(error)}`,
                    createdAt: Date.now(),
                  },
                ],
              },
            }
          }),
        })
      })
  },

  updateTextNode: (nodeId, text) => {
    set({
      nodes: get().nodes.map((node) => {
        if (node.id !== nodeId) return node

        return {
          ...node,
          data: {
            ...node.data,
            status: text.trim() ? 'ready' : 'empty',
            value: { text },
          },
        }
      }),
    })
  },

  loadAgents: async () => {
    set({ agentStatus: 'loading', agentError: undefined })

    try {
      const response = await fetchLocalAgents()
      const invokable = response.agents.find((agent) => agent.invokable)
      const currentSelected = get().selectedAgentId
      const stillAvailable = response.agents.some((agent) => agent.id === currentSelected && agent.invokable)

      set({
        agents: response.agents,
        selectedAgentId: stillAvailable ? currentSelected : invokable?.id,
        agentStatus: 'ready',
      })
    } catch (error) {
      set({
        agentStatus: 'error',
        agentError: error instanceof Error ? error.message : String(error),
      })
    }
  },

  selectAgent: (agentId) => {
    set({ selectedAgentId: agentId })
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

    const selectedAgent = agents.find((agent) => agent.id === (agentId ?? selectedAgentId) && agent.invokable)
    const result = await runWorkflowNode(
      {
        node: target,
        upstream,
        edges,
        prompt,
        selectedAgent,
      },
      {
        runTextAgent: runNodeWithAgent,
        runVisualModel: runVisualNode,
      },
    )

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
              {
                id: `msg-${Date.now()}-assistant`,
                role: 'assistant',
                text: result.assistantMessage,
                createdAt: Date.now(),
              },
            ],
          },
        }
      }),
    })
  },
}))
