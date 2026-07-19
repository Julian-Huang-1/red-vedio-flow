import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { Edge } from '@xyflow/react'
import type { WorkflowDocument } from '@red-video-flow/workflow-core'
import {
  createWorkflow,
  deleteWorkflow,
  fetchLocalAgents,
  fetchVisualModels,
  fetchWorkflow,
  fetchWorkflows,
  saveWorkflow,
} from '@red-video-flow/workflow-client'
import { toMaterialNode, type FlowNode } from '../workflowPresentation'

export const workflowQueryKeys = {
  agents: ['agents'] as const,
  visualModels: ['visual-models'] as const,
  workflows: ['workflows'] as const,
  workflow: (workflowId: string) => ['workflow', workflowId] as const,
}

export function useAgentsQuery(enabled = true) {
  return useQuery({
    queryKey: workflowQueryKeys.agents,
    queryFn: fetchLocalAgents,
    enabled,
  })
}

export function useWorkflowListQuery() {
  return useQuery({
    queryKey: workflowQueryKeys.workflows,
    queryFn: async () => (await fetchWorkflows()).workflows,
  })
}

export function useVisualModelsQuery(enabled = true) {
  return useQuery({
    queryKey: workflowQueryKeys.visualModels,
    queryFn: fetchVisualModels,
    enabled,
  })
}

export function useWorkflowQuery(workflowId: string) {
  return useQuery({
    queryKey: workflowQueryKeys.workflow(workflowId),
    queryFn: () => fetchWorkflow(workflowId),
    enabled: Boolean(workflowId),
  })
}

export function useCreateWorkflowMutation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (input: Partial<WorkflowDocument> = {}) => createWorkflow(input),
    onSuccess: (workflow) => {
      queryClient.setQueryData<WorkflowDocument>(workflowQueryKeys.workflow(workflow.id), workflow)
      queryClient.setQueryData<WorkflowDocument[]>(workflowQueryKeys.workflows, (current) =>
        current ? [workflow, ...current.filter((item) => item.id !== workflow.id)] : [workflow],
      )
      void queryClient.invalidateQueries({ queryKey: workflowQueryKeys.workflows })
    },
  })
}

export function useDeleteWorkflowMutation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: deleteWorkflow,
    onSuccess: (_result, workflowId) => {
      queryClient.removeQueries({ queryKey: workflowQueryKeys.workflow(workflowId) })
      queryClient.setQueryData<WorkflowDocument[]>(workflowQueryKeys.workflows, (current) =>
        current?.filter((workflow) => workflow.id !== workflowId),
      )
      void queryClient.invalidateQueries({ queryKey: workflowQueryKeys.workflows })
    },
  })
}

export type SaveWorkflowInput = {
  workflowId: string
  workflowTitle: string
  workflowRevision: number
  nodes: FlowNode[]
  edges: Edge[]
}

export function useSaveWorkflowMutation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ workflowId, workflowTitle, workflowRevision, nodes, edges }: SaveWorkflowInput) =>
      saveWorkflow({
        id: workflowId,
        title: workflowTitle,
        baseRevision: workflowRevision,
        graph: {
          nodes: nodes.map(toMaterialNode),
          edges: edges.map((edge) => ({ id: edge.id, source: edge.source, target: edge.target })),
        },
      }),
    onSuccess: (workflow) => {
      queryClient.setQueryData<WorkflowDocument>(workflowQueryKeys.workflow(workflow.id), workflow)
      queryClient.setQueryData<WorkflowDocument[]>(workflowQueryKeys.workflows, (current) =>
        current?.map((item) => (item.id === workflow.id ? workflow : item)),
      )
    },
  })
}
