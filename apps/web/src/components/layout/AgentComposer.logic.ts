import { useEffect, useMemo, useRef, useState, type ChangeEvent, type KeyboardEvent } from 'react'
import type { LocalAgent } from '@red-video-flow/workflow-core'
import type { MentionNode } from './AgentMentionMenu'

type UseAgentComposerOptions = {
  value: string
  nodes: MentionNode[]
  agents: LocalAgent[]
  onChange: (value: string) => void
  onSubmit: () => void
}

export function useAgentComposer({
  value,
  nodes,
  agents,
  onChange,
  onSubmit,
}: UseAgentComposerOptions) {
  const [mentionQuery, setMentionQuery] = useState<string | undefined>(undefined)
  const [activeMentionIndex, setActiveMentionIndex] = useState(0)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const availableAgents = useMemo(() => agents.filter((agent) => agent.invokable), [agents])
  const mentionOptions = useMemo(() => {
    const query = (mentionQuery ?? '').trim().toLowerCase()
    const options = query
      ? nodes.filter((node) => `${node.data.title} ${node.id}`.toLowerCase().includes(query))
      : nodes
    return options.slice(0, 8)
  }, [mentionQuery, nodes])

  useEffect(() => {
    if (!value) setMentionQuery(undefined)
  }, [value])

  const updateMentionQuery = (nextValue: string, caretIndex: number) => {
    const prefix = nextValue.slice(0, caretIndex)
    const match = prefix.match(/(?:^|\s)@([^\s@]*)$/)
    setMentionQuery(match ? match[1] : undefined)
    setActiveMentionIndex(0)
  }

  const insertMention = (nodeId: string) => {
    const node = nodes.find((item) => item.id === nodeId)
    if (!node) return

    const textarea = textareaRef.current
    const caretIndex = textarea?.selectionStart ?? value.length
    const prefix = value.slice(0, caretIndex)
    const suffix = value.slice(caretIndex)
    const match = prefix.match(/(?:^|\s)@([^\s@]*)$/)
    const mentionText = `@${node.data.title}`
    const nextValue = match
      ? `${prefix.slice(0, match.index)}${match[0].startsWith(' ') ? ' ' : ''}${mentionText} ${suffix}`
      : `${prefix}${prefix.endsWith(' ') || !prefix ? '' : ' '}${mentionText} ${suffix}`
    const mentionStart = nextValue.lastIndexOf(mentionText, nextValue.length - suffix.length)
    const nextCaret = mentionStart + mentionText.length + 1

    onChange(nextValue)
    setMentionQuery(undefined)
    window.setTimeout(() => {
      textareaRef.current?.focus()
      textareaRef.current?.setSelectionRange(nextCaret, nextCaret)
    }, 0)
  }

  const handleChange = (event: ChangeEvent<HTMLTextAreaElement>) => {
    onChange(event.target.value)
    updateMentionQuery(event.target.value, event.target.selectionStart)
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.nativeEvent.isComposing) return

    if (mentionQuery !== undefined) {
      if (mentionOptions.length > 0 && event.key === 'ArrowDown') {
        event.preventDefault()
        setActiveMentionIndex((index) => (index + 1) % mentionOptions.length)
        return
      }
      if (mentionOptions.length > 0 && event.key === 'ArrowUp') {
        event.preventDefault()
        setActiveMentionIndex((index) => (index - 1 + mentionOptions.length) % mentionOptions.length)
        return
      }
      if (mentionOptions.length > 0 && (event.key === 'Enter' || event.key === 'Tab')) {
        event.preventDefault()
        insertMention(mentionOptions[activeMentionIndex].id)
        return
      }
      if (event.key === 'Escape') {
        event.preventDefault()
        setMentionQuery(undefined)
        return
      }
    }

    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      onSubmit()
    }
  }

  return {
    activeMentionIndex,
    availableAgents,
    handleChange,
    handleKeyDown,
    insertMention,
    isMentionMenuOpen: mentionQuery !== undefined,
    mentionOptions,
    textareaRef,
  }
}
