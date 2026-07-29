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
  type MaterialType,
  type WorkflowEdge,
  type WorkflowDocument,
  type WorkflowPatchOperation,
} from '@red-video-flow/workflow-core'
import {
  fetchWorkflow,
  patchWorkflow,
  runNodeWithAgent,
  runVisualNode,
  uploadAsset,
  WorkflowClientResponseError,
} from '@red-video-flow/workflow-client'
import { runWorkflowNode } from '@red-video-flow/workflow-runtime'
import { getNodeTypeContribution } from '../extension-system/nodeExtensions.logic'
import { useAgentCatalogStore } from '../state/agentCatalogStore'
import { resetCanvasUiState, useCanvasUiStore } from '../state/canvasUiStore'
import { createFlowNode, toFlowNode, toMaterialNode, type FlowNode } from '../workflowPresentation'

type PersistenceStatus = 'idle' | 'loading' | 'saving' | 'saved' | 'error'
type WorkflowListStatus = 'idle' | 'loading' | 'ready' | 'error'

type WorkflowStore = {
  nodes: FlowNode[]
  edges: Edge[]
  workflowId: string
  workflowTitle: string
  workflowRevision: number
  workflows: WorkflowDocument[]
  workflowListStatus: WorkflowListStatus
  workflowListError?: string
  hasLoadedWorkflow: boolean
  persistenceStatus: PersistenceStatus
  persistenceError?: string
  onNodesChange: (changes: NodeChange[]) => void
  onEdgesChange: (changes: EdgeChange[]) => void
  connectNodes: (connection: Connection) => void
  createNode: (materialType: MaterialType, position?: XYPosition) => void
  selectNode: (nodeId?: string) => void
  beginEditNode: (nodeId: string) => void
  attachFileToNode: (nodeId: string, file: File) => void
  updateTextNode: (nodeId: string, text: string) => void
  runNode: (
    nodeId: string,
    prompt: string,
    options?: { agentId?: string; visualProviderId?: string },
  ) => Promise<void>
  applyWorkflowList: (workflows: WorkflowDocument[]) => void
  setWorkflowListQueryStatus: (status: WorkflowListStatus, error?: string) => void
  applyWorkflow: (document: WorkflowDocument) => void
  applyRemoteWorkflow: (document: WorkflowDocument) => void
  flushWorkflowPatches: () => Promise<void>
  resetWorkflow: () => void
  setPersistenceQueryStatus: (status: PersistenceStatus, error?: string) => void
}

let workflowPatchQueue = Promise.resolve()

export const useWorkflowStore = create<WorkflowStore>((set, get) => {
  const mergeRemoteWorkflow = (document: WorkflowDocument) => {
    set({
      workflowId: document.id,
      workflowTitle: document.title,
      workflowRevision: document.revision,
      nodes: document.graph.nodes.map((node) => toFlowNode(node)),
      edges: document.graph.edges.map(toFlowEdge),
      workflows: get().workflows.map((workflow) => (workflow.id === document.id ? document : workflow)),
      persistenceStatus: 'saved',
    })
  }

  const commitWorkflowPatch = async (ops: WorkflowPatchOperation[]) => {
    const { workflowId, workflowRevision, hasLoadedWorkflow } = get()
    if (!hasLoadedWorkflow || !ops.length) return undefined

    set({ persistenceStatus: 'saving', persistenceError: undefined })
    let response
    try {
      response = await patchWorkflow(workflowId, { baseRevision: workflowRevision, ops })
    } catch (error) {
      if (!(error instanceof WorkflowClientResponseError) || error.status !== 409) throw error
      const latest = await fetchWorkflow(workflowId)
      response = await patchWorkflow(workflowId, { baseRevision: latest.revision, ops })
    }
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

      mergeRemoteWorkflow(document)
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
  workflowId: 'default',
  workflowTitle: '默认工作流',
  workflowRevision: 0,
  workflows: [],
  workflowListStatus: 'idle',
  workflowListError: undefined,
  hasLoadedWorkflow: false,
  persistenceStatus: 'idle',
  persistenceError: undefined,
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

    const edge: Edge = {
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

  createNode: (materialType, position) => {
    const menu = useCanvasUiStore.getState().addNodeMenu
    const definition = getNodeTypeContribution(materialType)
    const node = createFlowNode(
      materialType,
      position ?? { x: menu.flowX, y: menu.flowY },
      definition
        ? {
            nodeTypeId: definition.id,
            title: definition.title,
            defaultSize: definition.defaultSize,
          }
        : undefined,
    )

    set({ nodes: [...get().nodes, node] })
    useCanvasUiStore.getState().setNodeInteraction({
      selectedNodeId: node.id,
      editingNodeId: undefined,
      composerNodeId: undefined,
    })
    useCanvasUiStore.getState().closeCanvasPanel()
    useCanvasUiStore.getState().closeAddNodeMenu()
    enqueueWorkflowPatch([{ type: 'addNode', node: toMaterialNode(node) }])
  },

  selectNode: (nodeId) => {
    const editingNodeId = useCanvasUiStore.getState().editingNodeId
    const node = get().nodes.find((item) => item.id === nodeId)
    const canShowComposer = node ? !hasMaterialValue(node) : false
    set({
      nodes: get().nodes.map((item) => ({
        ...item,
        selected: item.id === nodeId,
      })),
    })
    useCanvasUiStore.getState().setNodeInteraction({
      selectedNodeId: nodeId,
      editingNodeId: nodeId && editingNodeId === nodeId ? editingNodeId : undefined,
      composerNodeId: canShowComposer ? nodeId : undefined,
    })
    useCanvasUiStore.getState().closeCanvasPanel()
    useCanvasUiStore.getState().closeAddNodeMenu()
  },

  beginEditNode: (nodeId) => {
    useCanvasUiStore.getState().setNodeInteraction({
      selectedNodeId: nodeId,
      editingNodeId: nodeId,
      composerNodeId: undefined,
    })
    useCanvasUiStore.getState().closeAddNodeMenu()
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
    })
    const interaction = useCanvasUiStore.getState()
    interaction.setNodeInteraction({
      selectedNodeId: nodeId,
      editingNodeId: interaction.editingNodeId,
      composerNodeId: interaction.composerNodeId,
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

  applyWorkflowList: (workflows) => {
    set({ workflows, workflowListStatus: 'ready', workflowListError: undefined })
  },

  setWorkflowListQueryStatus: (status, error) => {
    set({ workflowListStatus: status, workflowListError: error })
  },

  applyWorkflow: (document) => {
    resetCanvasUiState()
    set({
      workflowId: document.id,
      workflowTitle: document.title,
      workflowRevision: document.revision,
      nodes: document.graph.nodes.map((node) => toFlowNode(node)),
      edges: document.graph.edges.map(toFlowEdge),
      hasLoadedWorkflow: true,
      persistenceStatus: 'saved',
      persistenceError: undefined,
      workflows: [document, ...get().workflows.filter((workflow) => workflow.id !== document.id)],
      workflowListStatus: 'ready',
    })
  },

  applyRemoteWorkflow: (document) => {
    const current = get()
    if (document.id !== current.workflowId || document.revision <= current.workflowRevision) return
    mergeRemoteWorkflow(document)
  },

  flushWorkflowPatches: async () => {
    await workflowPatchQueue
  },

  resetWorkflow: () => {
    resetCanvasUiState()
    set({
      workflowId: 'default',
      workflowTitle: '默认工作流',
      workflowRevision: 0,
      nodes: [],
      edges: [],
      hasLoadedWorkflow: false,
      persistenceStatus: 'saved',
    })
  },

  setPersistenceQueryStatus: (status, error) => {
    set({ persistenceStatus: status, persistenceError: error })
  },

  runNode: async (nodeId, prompt, options = {}) => {
    const { nodes, edges } = get()
    const { selectedAgentId, agents } = useAgentCatalogStore.getState()
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

    const selectedAgent = agents.find(
      (agent) => agent.id === (options.agentId ?? selectedAgentId) && agent.invokable,
    )
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
        runVisualModel: (payload) =>
          runVisualNode({
            ...payload,
            workflowId: get().workflowId,
            modelId: options.visualProviderId,
          }),
      },
    )

    if (target.data.materialType === 'image' || target.data.materialType === 'video') {
      try {
        mergeRemoteWorkflow(await fetchWorkflow(get().workflowId))
      } catch (error) {
        set({
          persistenceStatus: 'error',
          persistenceError: error instanceof Error ? error.message : String(error),
        })
      }
      return
    }

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

function toFlowEdge(edge: WorkflowEdge, index: number): Edge {
  return {
    ...edge,
    id: edge.id ?? `edge-${edge.source}-${edge.target}-${index}`,
  }
}
