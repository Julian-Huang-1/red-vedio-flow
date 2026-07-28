import type { Node } from '@xyflow/react'
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { getUpstreamNodes, hasMaterialValue, type MaterialNodeData } from '@red-video-flow/workflow-core'
import { useAgentsQuery, useVisualModelsQuery } from '../../../queries/workflowQueries'
import { useWorkflowStore } from '../../../store/workflowStore'

export function useNodePromptComposer(node: Node<MaterialNodeData, 'material'>) {
  const [prompt, setPrompt] = useState('')
  const [visualModelLabel, setVisualModelLabel] = useState('即梦 Dreamina')
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const agents = useWorkflowStore((state) => state.agents)
  const nodes = useWorkflowStore((state) => state.nodes)
  const edges = useWorkflowStore((state) => state.edges)
  const selectedAgentId = useWorkflowStore((state) => state.selectedAgentId)
  const agentStatus = useWorkflowStore((state) => state.agentStatus)
  const applyAgentsResponse = useWorkflowStore((state) => state.applyAgentsResponse)
  const setAgentQueryStatus = useWorkflowStore((state) => state.setAgentQueryStatus)
  const selectAgent = useWorkflowStore((state) => state.selectAgent)
  const closeComposer = useWorkflowStore((state) => state.closeComposer)
  const runNode = useWorkflowStore((state) => state.runNode)
  const isVisualNode = node.data.materialType === 'image' || node.data.materialType === 'video'
  const agentsQuery = useAgentsQuery(!isVisualNode)
  const visualModelsQuery = useVisualModelsQuery(isVisualNode)
  const availableAgents = useMemo(() => agents.filter((agent) => agent.invokable), [agents])
  const sendDisabled = node.data.status === 'running' || !prompt.trim()
  const inputMaterials = useMemo(
    () => getUpstreamNodes(nodes, edges, node.id).filter(hasMaterialValue),
    [edges, node.id, nodes],
  )
  const visibleInputMaterials = inputMaterials.slice(0, 3)
  const hiddenInputMaterialCount = inputMaterials.length - visibleInputMaterials.length

  const submit = async () => {
    const value = prompt.trim()
    if (!value) return
    await runNode(node.id, value, selectedAgentId)
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
    setAgentQueryStatus,
  ])

  useEffect(() => {
    if (!isVisualNode) return
    const model = visualModelsQuery.data?.models.find((item) => item.invokable)
      ?? visualModelsQuery.data?.models[0]
    if (model) setVisualModelLabel(model.label)
    if (visualModelsQuery.isError) setVisualModelLabel('视觉模型')
  }, [isVisualNode, visualModelsQuery.data, visualModelsQuery.isError])

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
    availableAgents,
    close: closeComposer,
    handleKeyDown,
    hiddenInputMaterialCount,
    isVisualNode,
    prompt,
    selectAgent,
    selectedAgentId,
    sendDisabled,
    setPrompt,
    submit: () => void submit(),
    textareaRef,
    visibleInputMaterials,
    visualModelLabel,
  }
}

