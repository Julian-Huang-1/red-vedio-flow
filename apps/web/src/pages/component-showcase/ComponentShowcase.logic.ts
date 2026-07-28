import { useMemo, useState } from 'react'
import { showcaseItems } from './showcaseRegistry'

export function useComponentShowcase() {
  const [selectedId, setSelectedId] = useState(showcaseItems[0]?.id)
  const [query, setQuery] = useState('')
  const filteredItems = useMemo(() => {
    const keyword = query.trim().toLowerCase()
    if (!keyword) return showcaseItems
    return showcaseItems.filter((item) =>
      `${item.title} ${item.category} ${item.description}`.toLowerCase().includes(keyword),
    )
  }, [query])
  const selectedItem = showcaseItems.find((item) => item.id === selectedId)
    ?? filteredItems[0]
    ?? showcaseItems[0]

  return {
    filteredItems,
    query,
    selectedItem,
    select: setSelectedId,
    setQuery,
  }
}

export function useCopyFeedback(value: string) {
  const [copied, setCopied] = useState(false)

  const copy = async () => {
    await navigator.clipboard.writeText(value)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1200)
  }

  return {
    copied,
    copy: () => void copy(),
  }
}

