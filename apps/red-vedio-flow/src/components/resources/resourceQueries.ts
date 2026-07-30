import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { ResourceKind, ResourceSource } from '@red-video-flow/workflow-core'
import {
  deleteResource,
  fetchResources,
  renameResource,
} from '@red-video-flow/workflow-client'

export function useResourcesQuery(input: {
  workspaceId: string
  kind?: ResourceKind
  source?: ResourceSource
  query?: string
}) {
  return useQuery({
    queryKey: ['resources', input],
    queryFn: () => fetchResources(input),
    enabled: Boolean(input.workspaceId),
  })
}

export function useRenameResourceMutation(workspaceId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: renameResource,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['resources'] }),
  })
}

export function useDeleteResourceMutation(workspaceId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: deleteResource,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['resources'] }),
  })
}
