import { useEffect, useRef } from 'react'
import type { ChatMessage } from './agentChatTypes'

export function useAgentMessageList(messages: ChatMessage[], isActive: boolean) {
  const endRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (isActive) endRef.current?.scrollIntoView({ block: 'end' })
  }, [isActive, messages])

  return { endRef }
}

