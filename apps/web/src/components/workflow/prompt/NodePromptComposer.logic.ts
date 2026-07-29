import type { Node } from '@xyflow/react'
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { getUpstreamNodes, hasMaterialValue, type MaterialNodeData } from '@red-video-flow/workflow-core'
import { useNodeTypeContribution } from '../../../extension-system/nodeExtensions.logic'
import { useAgentsQuery, useVisualModelsQuery } from '../../../queries/workflowQueries'
import { useAgentCatalogStore } from '../../../state/agentCatalogStore'
import { useCanvasUiStore } from '../../../state/canvasUiStore'
import {
  supportsVisualNodeKind,
  useVisualProviderStore,
  type VisualNodeKind,
} from '../../../state/visualProviderStore'
import { useWorkflowStore } from '../../../store/workflowStore'

export function useNodePromptComposer(node: Node<MaterialNodeData, string>) {
  const nodeDefinition = useNodeTypeContribution(node.data.materialType)
  const [prompt, setPrompt] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const agents = useAgentCatalogStore((state) => state.agents)
  const nodes = useWorkflowStore((state) => state.nodes)
  const edges = useWorkflowStore((state) => state.edges)
  const selectedAgentId = useAgentCatalogStore((state) => state.selectedAgentId)
  const agentStatus = useAgentCatalogStore((state) => state.status)
  const applyAgentsResponse = useAgentCatalogStore((state) => state.applyResponse)
  const setAgentQueryStatus = useAgentCatalogStore((state) => state.setQueryStatus)
  const selectAgent = useAgentCatalogStore((state) => state.selectAgent)
  const visualProviders = useVisualProviderStore((state) => state.providers)
  const visualNodeKind = isVisualMaterialType(node.data.materialType)
    ? node.data.materialType
    : undefined
  const selectedVisualProviderId = useVisualProviderStore(
    (state) => visualNodeKind ? state.selectedProviderIds[visualNodeKind] : undefined,
  )
  const visualProviderStatus = useVisualProviderStore((state) => state.status)
  const applyVisualProviders = useVisualProviderStore((state) => state.applyResponse)
  const setVisualProviderQueryStatus = useVisualProviderStore((state) => state.setQueryStatus)
  const selectVisualProvider = useVisualProviderStore((state) => state.selectProvider)
  const closeComposer = useCanvasUiStore((state) => state.closeComposer)
  const runNode = useWorkflowStore((state) => state.runNode)
  const isVisualNode = node.data.materialType === 'image' || node.data.materialType === 'video'
  const agentsQuery = useAgentsQuery(!isVisualNode)
  const visualModelsQuery = useVisualModelsQuery(isVisualNode)
  const availableAgents = useMemo(() => agents.filter((agent) => agent.invokable), [agents])
  const availableVisualProviders = useMemo(
    () => visualNodeKind
      ? visualProviders.filter(
          (provider) => provider.invokable && supportsVisualNodeKind(provider, visualNodeKind),
        )
      : [],
    [visualNodeKind, visualProviders],
  )
  const sendDisabled =
    node.data.status === 'running'
    || !prompt.trim()
    || (isVisualNode && !selectedVisualProviderId)
  const inputMaterials = useMemo(
    () => getUpstreamNodes(nodes, edges, node.id).filter(hasMaterialValue),
    [edges, node.id, nodes],
  )
  const visibleInputMaterials = inputMaterials.slice(0, 3)
  const hiddenInputMaterialCount = inputMaterials.length - visibleInputMaterials.length

  const submit = async () => {
    const value = prompt.trim()
    if (!value) return
    await runNode(node.id, value, {
      agentId: selectedAgentId,
      visualProviderId: selectedVisualProviderId,
    })
    setPrompt('')
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.nativeEvent.isComposing) return
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      void submit()
      return
    }
    if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') void submit()
  }

  useEffect(() => {
    if (isVisualNode) return
    if (agentsQuery.isLoading) setAgentQueryStatus('loading')
    if (agentsQuery.isError) {
      setAgentQueryStatus(
        'error',
        agentsQuery.error instanceof Error ? agentsQuery.error.message : String(agentsQuery.error),
      )
    }
    if (agentsQuery.data) applyAgentsResponse(agentsQuery.data)
  }, [
    agentsQuery.data,
    agentsQuery.error,
    agentsQuery.isError,
    agentsQuery.isLoading,
    applyAgentsResponse,
    isVisualNode,
    nodeDefinition,
    setAgentQueryStatus,
  ])

  useEffect(() => {
    if (!isVisualNode) return
    if (visualModelsQuery.isLoading) setVisualProviderQueryStatus('loading')
    if (visualModelsQuery.isError) {
      setVisualProviderQueryStatus(
        'error',
        visualModelsQuery.error instanceof Error
          ? visualModelsQuery.error.message
          : String(visualModelsQuery.error),
      )
    }
    if (visualModelsQuery.data) applyVisualProviders(visualModelsQuery.data)
  }, [
    applyVisualProviders,
    isVisualNode,
    setVisualProviderQueryStatus,
    visualModelsQuery.data,
    visualModelsQuery.error,
    visualModelsQuery.isError,
    visualModelsQuery.isLoading,
  ])

  useEffect(() => {
    setPrompt('')
  }, [node.id])

  useEffect(() => {
    const focusComposer = (event: Event) => {
      const customEvent = event as CustomEvent<{ nodeId: string }>
      if (customEvent.detail?.nodeId === node.id) textareaRef.current?.focus()
    }
    window.addEventListener('focus-node-composer', focusComposer)
    return () => window.removeEventListener('focus-node-composer', focusComposer)
  }, [node.id])

  return {
    agentStatus,
    availableVisualProviders,
    availableAgents,
    close: closeComposer,
    handleKeyDown,
    hiddenInputMaterialCount,
    isVisualNode,
    nodeDefinition,
    prompt,
    selectAgent,
    selectVisualProvider: (providerId: string) => {
      if (visualNodeKind) selectVisualProvider(visualNodeKind, providerId)
    },
    selectedAgentId,
    selectedVisualProviderId,
    sendDisabled,
    setPrompt,
    submit: () => void submit(),
    textareaRef,
    visibleInputMaterials,
    visualProviderStatus,
  }
}

function isVisualMaterialType(materialType: string): materialType is VisualNodeKind {
  return materialType === 'image' || materialType === 'video'
}
