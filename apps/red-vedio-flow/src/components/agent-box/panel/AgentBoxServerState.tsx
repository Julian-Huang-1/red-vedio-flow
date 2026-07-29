import { useEffect } from 'react'
import { useAgentBoxStore } from '../agentBoxStore'
import {
  usePiAgentModelsQuery,
  usePiAgentSessionQuery,
  usePiAgentSessionsQuery,
} from '../piAgentQueries'

export function AgentBoxServerState() {
  const activeSessionId = useAgentBoxStore((state) => state.activeSessionId)
  const hydrateModels = useAgentBoxStore((state) => state.hydrateModels)
  const hydrateSessions = useAgentBoxStore((state) => state.hydrateSessions)
  const hydrateSession = useAgentBoxStore((state) => state.hydrateSession)
  const setRunError = useAgentBoxStore((state) => state.setRunError)
  const modelsQuery = usePiAgentModelsQuery()
  const sessionsQuery = usePiAgentSessionsQuery()
  const sessionQuery = usePiAgentSessionQuery(activeSessionId)

  useEffect(() => {
    if (modelsQuery.data) hydrateModels(modelsQuery.data)
  }, [hydrateModels, modelsQuery.data])

  useEffect(() => {
    if (sessionsQuery.data) hydrateSessions(sessionsQuery.data)
  }, [hydrateSessions, sessionsQuery.data])

  useEffect(() => {
    if (sessionQuery.data) hydrateSession(sessionQuery.data)
  }, [hydrateSession, sessionQuery.data])

  useEffect(() => {
    const error = modelsQuery.error || sessionsQuery.error || sessionQuery.error
    if (error) setRunError(error instanceof Error ? error.message : String(error))
  }, [modelsQuery.error, sessionQuery.error, sessionsQuery.error, setRunError])

  return null
}
