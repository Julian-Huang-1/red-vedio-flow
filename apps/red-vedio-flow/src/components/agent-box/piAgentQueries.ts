import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  abortPiAgentPrompt,
  createPiAgentSession,
  deletePiAgentSession,
  getPiAgentSession,
  listPiAgentModels,
  listPiAgentSessions,
  renamePiAgentSession,
  streamPiAgentPrompt,
  type PiAgentEvent,
  type PiAgentPromptInput,
} from './piAgentClient'
import type { AgentAttachment } from './agentBoxTypes'

export const piAgentQueryKeys = {
  all: ['pi-agent'] as const,
  models: () => [...piAgentQueryKeys.all, 'models'] as const,
  sessions: (query = '') => [...piAgentQueryKeys.all, 'sessions', query] as const,
  session: (id: string) => [...piAgentQueryKeys.all, 'session', id] as const,
}

export function usePiAgentModelsQuery() {
  return useQuery({
    queryKey: piAgentQueryKeys.models(),
    queryFn: listPiAgentModels,
    staleTime: 5 * 60_000,
  })
}

export function usePiAgentSessionsQuery(query = '') {
  return useQuery({
    queryKey: piAgentQueryKeys.sessions(query),
    queryFn: () => listPiAgentSessions(query),
  })
}

export function usePiAgentSessionQuery(id?: string) {
  return useQuery({
    queryKey: piAgentQueryKeys.session(id ?? ''),
    queryFn: () => getPiAgentSession(id!),
    enabled: Boolean(id),
  })
}

export function useCreatePiAgentSessionMutation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, title }: { id: string; title?: string }) =>
      createPiAgentSession(id, title),
    onSuccess: (session) => {
      queryClient.setQueryData(piAgentQueryKeys.session(session.id), session)
      void queryClient.invalidateQueries({ queryKey: piAgentQueryKeys.sessions() })
    },
  })
}

export function useRenamePiAgentSessionMutation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, title }: { id: string; title: string }) =>
      renamePiAgentSession(id, title),
    onSuccess: (session) => {
      queryClient.setQueryData(piAgentQueryKeys.session(session.id), session)
      void queryClient.invalidateQueries({ queryKey: piAgentQueryKeys.sessions() })
    },
  })
}

export function useDeletePiAgentSessionMutation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: deletePiAgentSession,
    onSuccess: (_result, id) => {
      queryClient.removeQueries({ queryKey: piAgentQueryKeys.session(id) })
      void queryClient.invalidateQueries({ queryKey: piAgentQueryKeys.sessions() })
    },
  })
}

export function usePiAgentPromptMutation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({
      sessionId,
      input,
      signal,
      onEvent,
    }: {
      sessionId: string
      input: PiAgentPromptInput
      signal: AbortSignal
      onEvent: (event: PiAgentEvent) => void
    }) => streamPiAgentPrompt(sessionId, input, signal, onEvent),
    onSettled: (_data, _error, variables) => {
      void queryClient.invalidateQueries({
        queryKey: piAgentQueryKeys.session(variables.sessionId),
      })
      void queryClient.invalidateQueries({ queryKey: piAgentQueryKeys.sessions() })
    },
  })
}

export function useAbortPiAgentPromptMutation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: abortPiAgentPrompt,
    onSettled: (_data, _error, sessionId) => {
      void queryClient.invalidateQueries({
        queryKey: piAgentQueryKeys.session(sessionId),
      })
    },
  })
}
