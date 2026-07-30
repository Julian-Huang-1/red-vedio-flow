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
  selectedNodeId?: string
  onNodesChange: (changes: NodeChange<WorkflowFlowNode>[]) => void
  onEdgesChange: (changes: EdgeChange[]) => void
  connectNodes: (connection: Connection) => void
  addNode: (kind: WorkflowNodeKind) => void
  selectNode: (nodeId?: string) => void
  updateComposer: (nodeId: string, patch: Partial<NodeComposerData>) => void
  addAttachment: (nodeId: string, attachment: AssetReference) => void
  appendResult: (nodeId: string, result: NodeResult, makeCurrent?: boolean) => void
  setCurrentResult: (nodeId: string, resultId: string) => void
  setLatestRun: (nodeId: string, runId?: string) => void
  setNodeStatus: (nodeId: string, status: NodeStatus) => void
  syncRevision: (revision?: number) => void
  buildRunInput: (nodeId: string) => NodeRunInput
  loadWorkflow: (document: WorkflowDocument) => void
  markSaved: (document: WorkflowDocument, savedVersion: number) => void
  toWorkflowDocument: () => WorkflowDocument
}

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
  onNodesChange: (changes) => {
    set({
      nodes: applyNodeChanges(changes, get().nodes),
      changeVersion: get().changeVersion + 1,
    })
  },
  onEdgesChange: (changes) => {
    set({
      edges: applyEdgeChanges(changes, get().edges),
      changeVersion: get().changeVersion + 1,
    })
  },
  connectNodes: (connection) => {
    if (!connection.source || !connection.target || connection.source === connection.target) return
    const exists = get().edges.some(
      (edge) => edge.source === connection.source && edge.target === connection.target,
    )
    if (exists) return
    set({
      edges: addEdge(
        {
          ...connection,
          id: `edge-${connection.source}-${connection.target}-${Date.now()}`,
        },
        get().edges,
      ),
      changeVersion: get().changeVersion + 1,
    })
  },
  addNode: (kind) => {
    const count = get().nodes.length
    set({
      nodes: [
        ...get().nodes,
        createWorkflowNode(
          `${kind}-${Date.now()}`,
          kind,
          { x: 160 + count * 48, y: 120 + count * 36 },
        ),
      ],
      changeVersion: get().changeVersion + 1,
    })
  },
  selectNode: (nodeId) => {
    set({
      selectedNodeId: nodeId,
      nodes: get().nodes.map((node) => ({
        ...node,
        selected: node.id === nodeId,
      })),
    })
  },
  updateComposer: (nodeId, patch) => {
    set({
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
      changeVersion: get().changeVersion + 1,
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
    set({
      nodes: updateNodeData(get().nodes, nodeId, (data) => ({
        ...data,
        results: [...data.results, result],
        currentResultId: makeCurrent ? result.id : data.currentResultId,
      })),
    })
  },
  setCurrentResult: (nodeId, resultId) => {
    set({
      nodes: updateNodeData(get().nodes, nodeId, (data) => ({
        ...data,
        currentResultId: data.results.some((result) => result.id === resultId)
          ? resultId
          : data.currentResultId,
      })),
      changeVersion: get().changeVersion + 1,
    })
  },
  setLatestRun: (nodeId, runId) => {
    set({
      nodes: updateNodeData(get().nodes, nodeId, (data) => ({
        ...data,
        latestRunId: runId,
      })),
      changeVersion: get().changeVersion + 1,
    })
  },
  setNodeStatus: (nodeId, status) => {
    set({
      nodes: updateNodeData(get().nodes, nodeId, (data) => ({
        ...data,
        status,
      })),
    })
  },
  syncRevision: (revision) => {
    if (revision === undefined || revision < get().revision) return
    set({ revision })
  },
  buildRunInput: (nodeId) => {
    const node = get().nodes.find((item) => item.id === nodeId)
    if (!node) throw new Error(`Workflow node not found: ${nodeId}`)
    const currentResult = node.data.results.find(
      (result) => result.id === node.data.currentResultId,
    )
    const generationConfig = node.data.composer.generationConfig
    const resolvedGenerationConfig = generationConfig.type === 'openai-image'
      && currentResult?.type === 'image'
      && currentResult.provider.responseId
      ? {
          ...generationConfig,
          providerOptions: {
            ...generationConfig.providerOptions,
            previousResponseId:
              generationConfig.providerOptions?.previousResponseId
              ?? currentResult.provider.responseId,
          },
        }
      : generationConfig
    return {
      prompt: node.data.composer.prompt,
      attachments: node.data.composer.attachments,
      upstreamResults: collectUpstreamResults(nodeId, get().nodes, get().edges),
      model: node.data.composer.model,
      generationConfig: resolvedGenerationConfig,
    }
  },
  loadWorkflow: (document) => {
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
      changeVersion: 0,
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

function createWorkflowNode(
  id: string,
  kind: WorkflowNodeKind,
  position: { x: number; y: number },
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
