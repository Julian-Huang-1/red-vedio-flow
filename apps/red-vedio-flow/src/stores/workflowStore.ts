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
  type WorkflowSubgraph,
  type WorkflowSubgraphCapability,
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
  subgraphs: WorkflowSubgraph[]
  past: WorkflowSnapshot[]
  future: WorkflowSnapshot[]
  selectedNodeId?: string
  onNodesChange: (changes: NodeChange<WorkflowFlowNode>[]) => void
  onEdgesChange: (changes: EdgeChange[]) => void
  connectNodes: (connection: Connection) => void
  addNode: (kind: WorkflowNodeKind, executionMode?: 'input' | 'generate') => void
  duplicateNode: (nodeId: string) => string | undefined
  setWorkflowTitle: (title: string) => void
  undo: () => void
  redo: () => void
  selectNode: (nodeId?: string) => void
  createSubgraph: (nodeIds: string[]) => WorkflowSubgraph | undefined
  duplicateSubgraph: (id: string) => string | undefined
  renameSubgraph: (id: string, name: string) => void
  setSubgraphCapability: (id: string, capability: WorkflowSubgraphCapability) => void
  toggleSubgraphCapabilityLabel: (
    subgraphId: string,
    nodeId: string,
    targetKind: 'node' | 'composer',
    direction: 'input' | 'output',
    valueType: WorkflowNodeKind,
  ) => void
  moveSubgraph: (id: string, position: { x: number; y: number }) => void
  updateSubgraphLayout: (
    id: string,
    layout: { position?: { x: number; y: number }; width?: number; height?: number },
  ) => void
  dissolveSubgraph: (id: string) => void
  deleteSubgraph: (id: string, deleteNodes?: boolean) => void
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
  subgraphs: WorkflowSubgraph[]
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
  audio: {
    kind: 'audio',
    title: '音频节点',
    description: '上传音频并作为多媒体工作流素材',
    promptPlaceholder: '音频生成能力接入后可在这里描述声音…',
  },
}


export const useWorkflowStore = create<WorkflowStore>((set, get) => ({
  workflowId: 'default',
  workflowTitle: '未命名工作流',
  revision: 0,
  changeVersion: 0,
  nodes: [],
  edges: [],
  subgraphs: [],
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
      subgraphs: get().subgraphs
        .map((item) => ({ ...item, nodeIds: item.nodeIds.filter((id) => nodes.some((node) => node.id === id)) }))
        .filter((item) => item.nodeIds.length > 0),
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
    const sourceGroup = get().subgraphs.find((item) => item.nodeIds.includes(connection.source!))?.id
    const targetGroup = get().subgraphs.find((item) => item.nodeIds.includes(connection.target!))?.id
    if (sourceGroup !== targetGroup && (sourceGroup || targetGroup)) return
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
  duplicateNode: (nodeId) => {
    const source = get().nodes.find((node) => node.id === nodeId)
    if (!source) return undefined
    const duplicateId = `${source.data.kind}-${Date.now()}-${Math.round(Math.random() * 1_000_000)}`
    const duplicate = structuredClone(source)
    duplicate.id = duplicateId
    duplicate.position = { x: source.position.x + 40, y: source.position.y + 40 }
    duplicate.selected = true
    duplicate.dragging = false
    if (duplicate.data.workflowInput) {
      duplicate.data.workflowInput.key = uniqueBoundaryLabel(
        duplicate.data.workflowInput.key,
        get().nodes.map((node) => node.data.workflowInput?.key).filter((key): key is string => Boolean(key)),
      )
    }
    if (duplicate.data.serviceLabel) {
      duplicate.data.serviceLabel = uniqueBoundaryLabel(
        duplicate.data.serviceLabel,
        get().nodes.map((node) => node.data.serviceLabel).filter((label): label is string => Boolean(label)),
      )
    }
    const subgraphs = get().subgraphs.map((subgraph) => {
      if (!subgraph.nodeIds.includes(nodeId)) return subgraph
      const capability = structuredClone(subgraph.capability ?? { inputs: [], outputs: [] })
      for (const input of capability.inputs.filter((item) => item.target.nodeId === nodeId)) {
        capability.inputs.push({
          ...structuredClone(input),
          label: nextCapabilityLabel('input', capability.inputs.map((item) => item.label)),
          target: { ...input.target, nodeId: duplicateId },
        })
      }
      for (const output of capability.outputs.filter((item) => item.target.nodeId === nodeId)) {
        capability.outputs.push({
          ...structuredClone(output),
          label: nextCapabilityLabel('output', capability.outputs.map((item) => item.label)),
          target: { ...output.target, nodeId: duplicateId },
        })
      }
      return {
        ...subgraph,
        nodeIds: [...subgraph.nodeIds, duplicateId],
        capability,
        updatedAt: Date.now(),
      }
    })
    set(commitHistory(get(), {
      nodes: [
        ...get().nodes.map((node) => ({ ...node, selected: false })),
        duplicate,
      ],
      subgraphs,
      selectedNodeId: duplicateId,
    }))
    return duplicateId
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
  createSubgraph: (nodeIds) => {
    const assigned = new Set(get().subgraphs.flatMap((item) => item.nodeIds))
    const validIds = [...new Set(nodeIds)].filter((id) => (
      !assigned.has(id) && get().nodes.some((node) => node.id === id)
    ))
    if (!validIds.length) return undefined
    const now = Date.now()
    const members = get().nodes.filter((node) => validIds.includes(node.id))
    const left = Math.min(...members.map((node) => node.position.x)) - 24
    const top = Math.min(...members.map((node) => node.position.y)) - 76
    const right = Math.max(...members.map((node) => node.position.x + (node.measured?.width ?? node.width ?? 360))) + 24
    const bottom = Math.max(...members.map((node) => node.position.y + (node.measured?.height ?? node.height ?? 260))) + 24
    const subgraph: WorkflowSubgraph = {
      id: `subgraph-${now}`,
      name: `子图 ${get().subgraphs.length + 1}`,
      nodeIds: validIds,
      position: { x: left, y: top },
      width: right - left,
      height: bottom - top,
      createdAt: now,
      updatedAt: now,
    }
    set(commitHistory(get(), {
      subgraphs: [...get().subgraphs, subgraph],
      nodes: get().nodes.map((node) => validIds.includes(node.id)
        ? {
            ...node,
            position: { x: node.position.x - left, y: node.position.y - top },
            parentId: subgraph.id,
            extent: 'parent' as const,
            expandParent: true,
            selected: false,
          }
        : { ...node, selected: false }),
      selectedNodeId: undefined,
    }))
    return subgraph
  },
  duplicateSubgraph: (id) => {
    const source = get().subgraphs.find((item) => item.id === id)
    if (!source) return undefined
    const nonce = `${Date.now()}-${Math.round(Math.random() * 1_000_000)}`
    const duplicateId = `subgraph-${nonce}`
    const memberIds = new Set(source.nodeIds)
    const sourceNodes = get().nodes.filter((node) => memberIds.has(node.id))
    if (!sourceNodes.length) return undefined

    const nodeIdMap = new Map(sourceNodes.map((node) => [node.id, `${node.data.kind}-${nonce}-${node.id}`]))
    const sourceEdges = get().edges.filter((edge) => memberIds.has(edge.source) && memberIds.has(edge.target))
    const edgeIdMap = new Map(sourceEdges.map((edge, index) => [edge.id, `edge-copy-${nonce}-${index}`]))
    const resultIdMap = new Map(sourceNodes.flatMap((node) => (
      node.data.results.map((result, index) => [result.id, `result-copy-${nonce}-${index}-${node.id}`] as const)
    )))
    const duplicateNodes = sourceNodes.map((sourceNode) => {
      const node = structuredClone(sourceNode)
      node.id = nodeIdMap.get(sourceNode.id)!
      node.parentId = duplicateId
      node.selected = false
      node.dragging = false
      node.data.results = node.data.results.map((result) => ({
        ...result,
        id: resultIdMap.get(result.id) ?? result.id,
      }))
      node.data.currentResultId = node.data.currentResultId
        ? resultIdMap.get(node.data.currentResultId) ?? node.data.currentResultId
        : undefined
      node.data.latestRunId = undefined
      node.data.composer.upstreamResults = (node.data.composer.upstreamResults ?? []).map((upstream) => ({
        ...upstream,
        nodeId: nodeIdMap.get(upstream.nodeId) ?? upstream.nodeId,
        edgeId: edgeIdMap.get(upstream.edgeId) ?? upstream.edgeId,
        resultId: resultIdMap.get(upstream.resultId) ?? upstream.resultId,
      }))
      return node
    })
    const duplicateEdges = sourceEdges.map((edge, index) => ({
      ...structuredClone(edge),
      id: edgeIdMap.get(edge.id) ?? `edge-copy-${nonce}-${index}`,
      source: nodeIdMap.get(edge.source)!,
      target: nodeIdMap.get(edge.target)!,
    }))
    const capability = source.capability
      ? structuredClone(source.capability)
      : undefined
    if (capability) {
      capability.inputs = capability.inputs.map((input) => ({
        ...input,
        target: { ...input.target, nodeId: nodeIdMap.get(input.target.nodeId) ?? input.target.nodeId },
      }))
      capability.outputs = capability.outputs.map((output) => ({
        ...output,
        target: { ...output.target, nodeId: nodeIdMap.get(output.target.nodeId) ?? output.target.nodeId },
      }))
    }
    const now = Date.now()
    const duplicate: WorkflowSubgraph = {
      ...structuredClone(source),
      id: duplicateId,
      name: uniqueSubgraphCopyName(source.name, get().subgraphs.map((item) => item.name)),
      nodeIds: source.nodeIds.map((nodeId) => nodeIdMap.get(nodeId)!).filter(Boolean),
      position: {
        x: (source.position?.x ?? 0) + 48,
        y: (source.position?.y ?? 0) + 48,
      },
      capability,
      createdAt: now,
      updatedAt: now,
    }
    set(commitHistory(get(), {
      nodes: [...get().nodes.map((node) => ({ ...node, selected: false })), ...duplicateNodes],
      edges: [...get().edges, ...duplicateEdges],
      subgraphs: [...get().subgraphs, duplicate],
      selectedNodeId: undefined,
    }))
    return duplicateId
  },
  renameSubgraph: (id, name) => {
    const nextName = name.trim()
    if (!nextName) return
    set(commitHistory(get(), {
      subgraphs: get().subgraphs.map((item) => item.id === id
        ? { ...item, name: nextName, updatedAt: Date.now() }
        : item),
    }))
  },
  setSubgraphCapability: (id, capability) => {
    set(commitHistory(get(), {
      subgraphs: get().subgraphs.map((item) => item.id === id
        ? { ...item, capability, updatedAt: Date.now() }
        : item),
    }))
  },
  toggleSubgraphCapabilityLabel: (subgraphId, nodeId, targetKind, direction, valueType) => {
    const subgraph = get().subgraphs.find((item) => item.id === subgraphId)
    if (!subgraph) return
    const capability = structuredClone(subgraph.capability ?? { inputs: [], outputs: [] })
    const collection = direction === 'input' ? capability.inputs : capability.outputs
    const existingIndex = collection.findIndex((item) => (
      item.target.nodeId === nodeId && item.target.kind === targetKind
    ))
    if (existingIndex >= 0) collection.splice(existingIndex, 1)
    else {
      if (direction === 'input') {
        capability.inputs = capability.inputs.filter((item) => item.target.nodeId !== nodeId)
        capability.inputs.push({
          label: nextCapabilityLabel('input', capability.inputs.map((item) => item.label)),
          target: { nodeId, kind: targetKind },
          valueType: targetKind === 'composer' ? 'text' : valueType,
          required: true,
        })
      } else {
        capability.outputs.push({
          label: nextCapabilityLabel('output', capability.outputs.map((item) => item.label)),
          target: { nodeId, kind: targetKind },
          valueType,
        })
      }
    }
    get().setSubgraphCapability(subgraphId, capability)
  },
  moveSubgraph: (id, position) => {
    set(commitHistory(get(), {
      subgraphs: get().subgraphs.map((item) => item.id === id
        ? { ...item, position, updatedAt: Date.now() }
        : item),
    }, `subgraph-position:${id}`))
  },
  updateSubgraphLayout: (id, layout) => {
    set({
      subgraphs: get().subgraphs.map((item) => item.id === id
        ? {
            ...item,
            position: layout.position ?? item.position,
            width: layout.width ?? item.width,
            height: layout.height ?? item.height,
            updatedAt: Date.now(),
          }
        : item),
      changeVersion: get().changeVersion + 1,
    })
  },
  dissolveSubgraph: (id) => {
    const subgraph = get().subgraphs.find((item) => item.id === id)
    if (!subgraph) return
    const origin = subgraph.position ?? { x: 0, y: 0 }
    set(commitHistory(get(), {
      subgraphs: get().subgraphs.filter((item) => item.id !== id),
      nodes: get().nodes.map((node) => node.parentId === id
        ? {
            ...node,
            position: { x: node.position.x + origin.x, y: node.position.y + origin.y },
            parentId: undefined,
            extent: undefined,
          }
        : node),
    }))
  },
  deleteSubgraph: (id, deleteNodes = false) => {
    const subgraph = get().subgraphs.find((item) => item.id === id)
    if (!subgraph) return
    const removed = new Set(deleteNodes ? subgraph.nodeIds : [])
    set(commitHistory(get(), {
      subgraphs: get().subgraphs.filter((item) => item.id !== id),
      nodes: get().nodes.filter((node) => !removed.has(node.id)),
      edges: get().edges.filter((edge) => !removed.has(edge.source) && !removed.has(edge.target)),
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
    const normalized = normalizeSubgraphLayout(document.graph.nodes, document.graph.subgraphs ?? [])
    set({
      workflowId: document.id,
      workflowTitle: document.title,
      revision: document.revision,
      nodes: normalized.nodes.map((node) => toFlowNode(node, normalized.subgraphs)),
      edges: document.graph.edges.map((edge, index) => ({
        ...edge,
        id: edge.id ?? `edge-${edge.source}-${edge.target}-${index}`,
      })),
      subgraphs: normalized.subgraphs,
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
        subgraphs: state.subgraphs,
      },
    }
  },
}))

// 仅开发环境挂到 window，方便在浏览器控制台调试（生产构建时会被 tree-shake 掉）
if (import.meta.env.DEV && typeof window !== 'undefined') {
  window.__workflowStore = useWorkflowStore
}

function snapshot(state: Pick<WorkflowStore, 'nodes' | 'edges' | 'subgraphs' | 'selectedNodeId'>): WorkflowSnapshot {
  return cloneSnapshot({
    nodes: state.nodes,
    edges: state.edges,
    subgraphs: state.subgraphs,
    selectedNodeId: state.selectedNodeId,
  })
}

function nextCapabilityLabel(prefix: 'input' | 'output', labels: string[]) {
  let index = 1
  while (labels.includes(`${prefix}_${index}`)) index += 1
  return `${prefix}_${index}`
}

function uniqueBoundaryLabel(source: string, labels: string[]) {
  let index = 2
  let candidate = `${source}_copy`
  while (labels.includes(candidate)) {
    candidate = `${source}_copy_${index}`
    index += 1
  }
  return candidate
}

function uniqueSubgraphCopyName(source: string, names: string[]) {
  const base = `${source} 副本`
  if (!names.includes(base)) return base
  let index = 2
  while (names.includes(`${base} ${index}`)) index += 1
  return `${base} ${index}`
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
        title: kind === 'audio' ? '音频输入' : '工作流输入',
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

function toFlowNode(node: MaterialNode, subgraphs: WorkflowSubgraph[] = []): WorkflowFlowNode {
  const definition = nodeDefinitions[node.data.materialType]
  const parent = subgraphs.find((subgraph) => subgraph.nodeIds.includes(node.id))
  return {
    id: node.id,
    type: 'workflow',
    position: node.position,
    width: node.width,
    height: node.height,
    parentId: parent?.id,
    extent: parent ? 'parent' : undefined,
    expandParent: Boolean(parent),
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

function normalizeSubgraphLayout(
  sourceNodes: MaterialNode[],
  sourceSubgraphs: WorkflowSubgraph[],
): { nodes: MaterialNode[]; subgraphs: WorkflowSubgraph[] } {
  let nodes = structuredClone(sourceNodes)
  const subgraphs = sourceSubgraphs.map((subgraph) => {
    if (subgraph.position && subgraph.width && subgraph.height) return subgraph
    const members = nodes.filter((node) => subgraph.nodeIds.includes(node.id))
    if (!members.length) return subgraph
    const left = Math.min(...members.map((node) => node.position.x)) - 24
    const top = Math.min(...members.map((node) => node.position.y)) - 76
    const right = Math.max(...members.map((node) => node.position.x + (node.width ?? 360))) + 24
    const bottom = Math.max(...members.map((node) => node.position.y + (node.height ?? 260))) + 24
    nodes = nodes.map((node) => subgraph.nodeIds.includes(node.id)
      ? { ...node, position: { x: node.position.x - left, y: node.position.y - top } }
      : node)
    return {
      ...subgraph,
      position: { x: left, y: top },
      width: right - left,
      height: bottom - top,
    }
  })
  return { nodes, subgraphs }
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
