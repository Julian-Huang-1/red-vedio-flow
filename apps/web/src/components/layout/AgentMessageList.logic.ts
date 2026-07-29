import { useEffect, useRef } from 'react'
import { useAgentMessageRenderers } from '../../extension-system/agentExtensions.logic'
import type { ChatMessage } from './agentChatTypes'

export function useAgentMessageList(messages: ChatMessage[], isActive: boolean) {
  const endRef = useRef<HTMLDivElement>(null)
  const renderers = useAgentMessageRenderers()

  useEffect(() => {
    if (isActive) endRef.current?.scrollIntoView({ block: 'end' })
  }, [isActive, messages])

  return {
    endRef,
    getRenderer: (message: ChatMessage) =>
      renderers.find((renderer) => renderer.messageType === (message.kind ?? 'text')),
  }
}
