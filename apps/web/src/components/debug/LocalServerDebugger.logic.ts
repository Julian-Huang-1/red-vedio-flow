import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import {
  clearWorkflowDebugEvents,
  getWorkflowDebugEventsSnapshot,
  subscribeWorkflowDebugEvents,
  type WorkflowDebugEvent,
} from '@red-video-flow/workflow-client'
import { useCanvasUiStore } from '../../state/canvasUiStore'

export type DebugFilter = 'all' | 'http' | 'sse' | 'error'

export const debugFilters: Array<{ id: DebugFilter; label: string }> = [
  { id: 'all', label: '全部' },
  { id: 'http', label: 'HTTP' },
  { id: 'sse', label: 'SSE' },
  { id: 'error', label: '错误' },
]

export function useLocalServerDebugger() {
  const openWorkspacePanels = useCanvasUiStore((state) => state.openWorkspacePanels)
  const events = useSyncExternalStore(
    subscribeWorkflowDebugEvents,
    getWorkflowDebugEventsSnapshot,
    getWorkflowDebugEventsSnapshot,
  )
  const [isOpen, setIsOpen] = useState(false)
  const [filter, setFilter] = useState<DebugFilter>('all')
  const [query, setQuery] = useState('')
  const [copied, setCopied] = useState(false)
  const endRef = useRef<HTMLDivElement>(null)
  const visibleEvents = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase()
    return events.filter((event) => {
      if (filter === 'http' && event.kind === 'sse-event') return false
      if (filter === 'sse' && event.kind !== 'sse-event') return false
      if (filter === 'error' && !isErrorEvent(event)) return false
      if (!normalizedQuery) return true
      return stringifyEvent(event).toLowerCase().includes(normalizedQuery)
    })
  }, [events, filter, query])
  const errorCount = useMemo(
    () => new Set(events.filter(isErrorEvent).map((event) => event.requestId ?? event.id)).size,
    [events],
  )

  useEffect(() => {
    if (isOpen) endRef.current?.scrollIntoView({ block: 'end' })
  }, [isOpen, visibleEvents])

  useEffect(() => {
    if (!isOpen) return
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsOpen(false)
    }
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [isOpen])

  const copyLogs = async () => {
    try {
      await navigator.clipboard.writeText(JSON.stringify(visibleEvents, null, 2))
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1200)
    } catch {
      setCopied(false)
    }
  }

  return {
    clear: clearWorkflowDebugEvents,
    close: () => setIsOpen(false),
    copied,
    copyLogs: () => void copyLogs(),
    endRef,
    errorCount,
    events,
    filter,
    isOpen,
    isShifted: openWorkspacePanels.includes('agent'),
    query,
    setFilter,
    setQuery,
    toggle: () => setIsOpen((open) => !open),
    visibleEvents,
  }
}

export function eventLabel(event: WorkflowDebugEvent) {
  switch (event.kind) {
    case 'http-request':
      return { kind: 'REQ', main: `${event.method} ${event.path}`, meta: undefined }
    case 'http-response':
      return {
        kind: 'RES',
        main: `${event.status} ${event.path}`,
        meta: event.durationMs === undefined ? undefined : `${event.durationMs}ms`,
      }
    case 'http-response-body':
      return { kind: 'BODY', main: event.path, meta: undefined }
    case 'http-error':
      return {
        kind: 'ERR',
        main: `${event.method} ${event.path}`,
        meta: event.durationMs === undefined ? undefined : `${event.durationMs}ms`,
      }
    case 'sse-event': {
      const type = isRecord(event.data) && typeof event.data.type === 'string' ? event.data.type : 'message'
      return { kind: 'SSE', main: `${type} · ${event.path}`, meta: undefined }
    }
  }
}

export function isErrorEvent(event: WorkflowDebugEvent) {
  if (event.kind === 'http-error') return true
  if (
    (event.kind === 'http-response' || event.kind === 'http-response-body')
    && (event.status ?? 0) >= 400
  ) return true
  if (event.kind !== 'sse-event' || !isRecord(event.data)) return false
  if (event.data.type === 'error') return true
  return event.data.type === 'done' && typeof event.data.code === 'number' && event.data.code !== 0
}

export function formatTime(timestamp: number) {
  const date = new Date(timestamp)
  return [
    date.getHours().toString().padStart(2, '0'),
    date.getMinutes().toString().padStart(2, '0'),
    date.getSeconds().toString().padStart(2, '0'),
  ].join(':') + `.${date.getMilliseconds().toString().padStart(3, '0')}`
}

export function formatData(data: unknown) {
  if (typeof data === 'string') return data
  try {
    return JSON.stringify(data, null, 2)
  } catch {
    return String(data)
  }
}

function stringifyEvent(event: WorkflowDebugEvent) {
  try {
    return JSON.stringify(event)
  } catch {
    return `${event.kind} ${event.method ?? ''} ${event.path} ${event.status ?? ''}`
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}
