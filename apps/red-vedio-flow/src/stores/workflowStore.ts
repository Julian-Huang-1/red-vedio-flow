import {
  addEdge,
  applyEdgeChanges,
  applyNodeChanges,
  type Connection,
  type Edge,
  type EdgeChange,
  type NodeChange,
} from '@xyflow/react'
import { create } from 'zustand'
import {
  createDefaultComposer,
  type AssetReference,
  type GenerationConfig,
  type MaterialNode,
  type NodeStatus,
  type NodeComposerData,
  type NodeResult,
  type NodeRunInput,
  type UpstreamResultReference,
  type WorkflowDocument,
} from '@red-video-flow/workflow-core'
import type {
  WorkflowFlowNode,
  WorkflowNodeData,
  WorkflowNodeKind,
} from '@/components/workflow/workflowTypes'

type WorkflowStore = {
  workflowId: string
  workflowTitle: string
  revision: number
  changeVersion: number
  nodes: WorkflowFlowNode[]
  edges: Edge[]
  past: WorkflowSnapshot[]
  future: WorkflowSnapshot[]
  selectedNodeId?: string
  onNodesChange: (changes: NodeChange<WorkflowFlowNode>[]) => void
  onEdgesChange: (changes: EdgeChange[]) => void
  connectNodes: (connection: Connection) => void
  addNode: (kind: WorkflowNodeKind, executionMode?: 'input' | 'generate') => void
  setWorkflowTitle: (title: string) => void
  undo: () => void
  redo: () => void
  selectNode: (nodeId?: string) => void
  updateComposer: (nodeId: string, patch: Partial<NodeComposerData>) => void
  syncComposerUpstreamResults: (
    nodeId: string,
    upstreamResults: UpstreamResultReference[],
  ) => void
  addAttachment: (nodeId: string, attachment: AssetReference) => void
  appendResult: (nodeId: string, result: NodeResult, makeCurrent?: boolean) => void
  setCurrentResult: (nodeId: string, resultId: string) => void
  setLatestRun: (nodeId: string, runId?: string) => void
  setNodeStatus: (nodeId: string, status: NodeStatus) => void
  syncRevision: (revision?: number) => void
  buildRunInput: (nodeId: string) => NodeRunInput
  loadWorkflow: (document: WorkflowDocument) => void
  syncExecutionState: (document: WorkflowDocument) => void
  markSaved: (document: WorkflowDocument, savedVersion: number) => void
  toWorkflowDocument: () => WorkflowDocument
}

type WorkflowSnapshot = {
  nodes: WorkflowFlowNode[]
  edges: Edge[]
  selectedNodeId?: string
}

const HISTORY_LIMIT = 50
let activeHistoryGroup: { key: string; updatedAt: number } | undefined

const nodeDefinitions: Record<
  WorkflowNodeKind,
  Pick<WorkflowNodeData, 'kind' | 'title' | 'description' | 'promptPlaceholder'>
> = {
  text: {
    kind: 'text',
    title: '文本节点',
    description: '生成脚本、旁白或镜头描述',
    promptPlaceholder: '描述需要生成的文本…',
  },
  image: {
    kind: 'image',
    title: '图片节点',
    description: '根据提示词或上游内容生成图片',
    promptPlaceholder: '描述画面、风格和构图…',
  },
  video: {
    kind: 'video',
    title: '视频节点',
    description: '将画面与描述转化为视频',
    promptPlaceholder: '描述运动、镜头和时长…',
  },
}


export const useWorkflowStore = create<WorkflowStore>((set, get) => ({
  workflowId: 'default',
  workflowTitle: '未命名工作流',
  revision: 0,
  changeVersion: 0,
  nodes: [],
  edges: [],
  past: [],
  future: [],
  onNodesChange: (changes) => {
    const nodes = applyNodeChanges(changes, get().nodes)
    if (changes.every((change) => change.type === 'dimensions')) {
      set({ nodes })
      return
    }
    const positionChanges = changes.filter((change) => change.type === 'position')
    const groupKey = positionChanges.length
      ? `position:${positionChanges.map((change) => change.id).sort().join(',')}`
      : undefined
    set(commitHistory(get(), {
      nodes,
      selectedNodeId: nodes.find((node) => node.selected)?.id,
    }, groupKey))
    if (positionChanges.length && positionChanges.every((change) => !change.dragging)) {
      activeHistoryGroup = undefined
    }
  },
  onEdgesChange: (changes) => {
    set(commitHistory(get(), {
      edges: applyEdgeChanges(changes, get().edges),
    }))
  },
  connectNodes: (connection) => {
    if (!connection.source || !connection.target || connection.source === connection.target) return
    const exists = get().edges.some(
      (edge) => edge.source === connection.source && edge.target === connection.target,
    )
    if (exists) return
    set(commitHistory(get(), {
      edges: addEdge(
        {
          ...connection,
          id: `edge-${connection.source}-${connection.target}-${Date.now()}`,
        },
        get().edges,
      ),
    }))
  },
  addNode: (kind, executionMode = 'generate') => {
    const count = get().nodes.length
    set(commitHistory(get(), {
      nodes: [
        ...get().nodes,
        createWorkflowNode(
          `${kind}-${Date.now()}`,
          kind,
          { x: 160 + count * 48, y: 120 + count * 36 },
          executionMode,
          count + 1,
        ),
      ],
    }))
  },
  setWorkflowTitle: (title) => {
    const nextTitle = title.trim()
    if (!nextTitle || nextTitle === get().workflowTitle) return
    set({
      workflowTitle: nextTitle,
      changeVersion: get().changeVersion + 1,
    })
  },
  undo: () => {
    activeHistoryGroup = undefined
    const state = get()
    const previous = state.past[state.past.length - 1]
    if (!previous) return
    set({
      ...cloneSnapshot(previous),
      past: state.past.slice(0, -1),
      future: [snapshot(state), ...state.future].slice(0, HISTORY_LIMIT),
      changeVersion: state.changeVersion + 1,
    })
  },
  redo: () => {
    activeHistoryGroup = undefined
    const state = get()
    const next = state.future[0]
    if (!next) return
    set({
      ...cloneSnapshot(next),
      past: [...state.past, snapshot(state)].slice(-HISTORY_LIMIT),
      future: state.future.slice(1),
      changeVersion: state.changeVersion + 1,
    })
  },
  selectNode: (nodeId) => {
    const nodes = get().nodes.map((node) => ({
      ...node,
      selected: node.id === nodeId,
    }))
    if (
      get().selectedNodeId === nodeId
      && nodes.every((node, index) => node.selected === get().nodes[index]?.selected)
    ) return
    set(commitHistory(get(), {
      selectedNodeId: nodeId,
      nodes,
    }))
  },
  updateComposer: (nodeId, patch) => {
    set(commitHistory(get(), {
      nodes: updateNodeData(get().nodes, nodeId, (data) => ({
        ...data,
        composer: {
          ...data.composer,
          ...patch,
          generationConfig: mergeGenerationConfig(
            data.composer.generationConfig,
            patch.generationConfig,
          ),
          updatedAt: Date.now(),
        },
      })),
    }, `composer:${nodeId}`))
  },
  syncComposerUpstreamResults: (nodeId, upstreamResults) => {
    set({
      nodes: updateNodeData(get().nodes, nodeId, (data) => ({
        ...data,
        composer: {
          ...data.composer,
          upstreamResults,
        },
      })),
    })
  },
  addAttachment: (nodeId, attachment) => {
    const node = get().nodes.find((item) => item.id === nodeId)
    if (!node || node.data.composer.attachments.some((item) => item.id === attachment.id)) return
    get().updateComposer(nodeId, {
      attachments: [...node.data.composer.attachments, attachment],
    })
  },
  appendResult: (nodeId, result, makeCurrent = true) => {
    set(commitHistory(get(), {
      nodes: updateNodeData(get().nodes, nodeId, (data) => ({
        ...data,
        results: [...data.results, result],
        currentResultId: makeCurrent ? result.id : data.currentResultId,
      })),
    }))
  },
  setCurrentResult: (nodeId, resultId) => {
    set(commitHistory(get(), {
      nodes: updateNodeData(get().nodes, nodeId, (data) => ({
        ...data,
        currentResultId: data.results.some((result) => result.id === resultId)
          ? resultId
          : data.currentResultId,
      })),
    }))
  },
  setLatestRun: (nodeId, runId) => {
    set(commitHistory(get(), {
      nodes: updateNodeData(get().nodes, nodeId, (data) => ({
        ...data,
        latestRunId: runId,
      })),
    }))
  },
  setNodeStatus: (nodeId, status) => {
    const node = get().nodes.find((item) => item.id === nodeId)
    if (!node || node.data.status === status) return
    set(commitHistory(get(), {
      nodes: updateNodeData(get().nodes, nodeId, (data) => ({
        ...data,
        status,
      })),
    }))
  },
  syncRevision: (revision) => {
    if (revision === undefined || revision < get().revision) return
    set({ revision })
  },
  buildRunInput: (nodeId) => {
    const node = get().nodes.find((item) => item.id === nodeId)
    if (!node) throw new Error(`Workflow node not found: ${nodeId}`)
    const generationConfig = node.data.composer.generationConfig
    return {
      prompt: node.data.composer.prompt,
      attachments: node.data.composer.attachments,
      upstreamResults: collectUpstreamResults(nodeId, get().nodes, get().edges),
      model: node.data.composer.model,
      generationConfig,
    }
  },
  loadWorkflow: (document) => {
    activeHistoryGroup = undefined
    set({
      workflowId: document.id,
      workflowTitle: document.title,
      revision: document.revision,
      nodes: document.graph.nodes.map(toFlowNode),
      edges: document.graph.edges.map((edge, index) => ({
        ...edge,
        id: edge.id ?? `edge-${edge.source}-${edge.target}-${index}`,
      })),
      selectedNodeId: undefined,
      past: [],
      future: [],
      changeVersion: 0,
    })
  },
  syncExecutionState: (document) => {
    if (document.id !== get().workflowId) return
    const serverNodes = new Map(document.graph.nodes.map((node) => [node.id, node]))
    set({
      revision: Math.max(get().revision, document.revision),
      nodes: get().nodes.map((node) => {
        const serverNode = serverNodes.get(node.id)
        if (!serverNode) return node
        return {
          ...node,
          data: {
            ...node.data,
            status: serverNode.data.status,
            results: serverNode.data.results ?? [],
            currentResultId: serverNode.data.currentResultId,
            latestRunId: serverNode.data.latestRunId,
            composer: {
              ...node.data.composer,
              upstreamResults: serverNode.data.composer?.upstreamResults ?? [],
            },
          },
        }
      }),
    })
  },
  markSaved: (document, savedVersion) => {
    if (document.id !== get().workflowId) return
    set({
      workflowTitle: document.title,
      revision: document.revision,
      changeVersion: get().changeVersion === savedVersion ? 0 : get().changeVersion,
    })
  },
  toWorkflowDocument: () => {
    const state = get()
    const now = Date.now()
    return {
      schemaVersion: 1,
      id: state.workflowId,
      title: state.workflowTitle,
      revision: state.revision,
      createdAt: now,
      updatedAt: now,
      graph: {
        nodes: state.nodes.map(toMaterialNode),
        edges: state.edges.map(({ id, source, target }) => ({ id, source, target })),
      },
    }
  },
}))

// 仅开发环境挂到 window，方便在浏览器控制台调试（生产构建时会被 tree-shake 掉）
if (import.meta.env.DEV && typeof window !== 'undefined') {
  window.__workflowStore = useWorkflowStore
}

function snapshot(state: Pick<WorkflowStore, 'nodes' | 'edges' | 'selectedNodeId'>): WorkflowSnapshot {
  return cloneSnapshot({
    nodes: state.nodes,
    edges: state.edges,
    selectedNodeId: state.selectedNodeId,
  })
}

function cloneSnapshot(value: WorkflowSnapshot): WorkflowSnapshot {
  return structuredClone(value)
}

function commitHistory(
  state: WorkflowStore,
  patch: Partial<WorkflowSnapshot>,
  groupKey?: string,
): Partial<WorkflowStore> {
  const now = Date.now()
  const grouped = Boolean(
    groupKey
    && activeHistoryGroup?.key === groupKey
    && now - activeHistoryGroup.updatedAt < 800,
  )
  activeHistoryGroup = groupKey ? { key: groupKey, updatedAt: now } : undefined
  return {
    ...patch,
    past: grouped
      ? state.past
      : [...state.past, snapshot(state)].slice(-HISTORY_LIMIT),
    future: [],
    changeVersion: state.changeVersion + 1,
  }
}

function createWorkflowNode(
  id: string,
  kind: WorkflowNodeKind,
  position: { x: number; y: number },
  executionMode: 'input' | 'generate' = 'generate',
  inputIndex = 1,
): WorkflowFlowNode {
  return {
    id,
    type: 'workflow',
    position,
    data: {
      ...nodeDefinitions[kind],
      status: 'empty',
      composer: createDefaultComposer(kind),
      results: [],
      executionMode,
      ...(executionMode === 'input' ? {
        title: '工作流输入',
        workflowInput: {
          key: `input_${inputIndex}`,
          title: `输入 ${inputIndex}`,
          valueType: kind,
          required: true,
        },
      } : {}),
    },
  }
}

function toFlowNode(node: MaterialNode): WorkflowFlowNode {
  const definition = nodeDefinitions[node.data.materialType]
  return {
    id: node.id,
    type: 'workflow',
    position: node.position,
    width: node.width,
    height: node.height,
    data: {
      ...definition,
      status: node.data.status,
      title: node.data.title,
      composer: node.data.composer ?? createDefaultComposer(node.data.materialType),
      results: node.data.results ?? [],
      currentResultId: node.data.currentResultId,
      latestRunId: node.data.latestRunId,
      executionMode: node.data.executionMode,
      workflowInput: node.data.workflowInput,
      serviceRole: node.data.serviceRole,
      serviceLabel: node.data.serviceLabel,
    },
  }
}

function toMaterialNode(node: WorkflowFlowNode): MaterialNode {
  return {
    id: node.id,
    position: node.position,
    width: node.width,
    height: node.height,
    data: {
      materialType: node.data.kind,
      title: node.data.title,
      status: node.data.status,
      value: {},
      messages: [],
      composer: node.data.composer,
      results: node.data.results,
      currentResultId: node.data.currentResultId,
      latestRunId: node.data.latestRunId,
      executionMode: node.data.executionMode,
      workflowInput: node.data.workflowInput,
      serviceRole: node.data.serviceRole,
      serviceLabel: node.data.serviceLabel,
    },
  }
}

function updateNodeData(
  nodes: WorkflowFlowNode[],
  nodeId: string,
  update: (data: WorkflowNodeData) => WorkflowNodeData,
) {
  return nodes.map((node) => (
    node.id === nodeId ? { ...node, data: update(node.data) } : node
  ))
}

function mergeGenerationConfig(
  current: GenerationConfig,
  next?: GenerationConfig,
): GenerationConfig {
  if (!next) return current
  if (current.type !== next.type) return next
  return { ...current, ...next } as GenerationConfig
}

function collectUpstreamResults(
  targetNodeId: string,
  nodes: WorkflowFlowNode[],
  edges: Edge[],
): UpstreamResultReference[] {
  return edges.flatMap((edge) => {
    if (edge.target !== targetNodeId) return []
    const source = nodes.find((node) => node.id === edge.source)
    if (!source?.data.currentResultId) return []
    const result = source.data.results.find(
      (candidate) => candidate.id === source.data.currentResultId,
    )
    if (!result) return []
    return [{
      edgeId: edge.id,
      nodeId: source.id,
      resultId: result.id,
      resultType: result.type,
      assets: result.type === 'image'
        ? result.images
        : result.type === 'video'
          ? [result.video, ...(result.lastFrame ? [result.lastFrame] : [])]
          : [],
      text: result.type === 'text' ? result.text : undefined,
    }]
  })
}
