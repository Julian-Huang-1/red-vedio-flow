export type WorkflowDebugEventKind =
  | 'http-request'
  | 'http-response'
  | 'http-response-body'
  | 'http-error'
  | 'sse-event'

export type WorkflowDebugEvent = {
  id: string
  requestId?: string
  kind: WorkflowDebugEventKind
  timestamp: number
  path: string
  method?: string
  status?: number
  durationMs?: number
  data?: unknown
}

export type WorkflowDebugEventInput = Omit<WorkflowDebugEvent, 'id' | 'timestamp'> & {
  timestamp?: number
}

const maxEvents = 500
const listeners = new Set<() => void>()
const responseRequestIds = new WeakMap<Response, string>()
let sequence = 0
let events: WorkflowDebugEvent[] = []

export function recordWorkflowDebugEvent(input: WorkflowDebugEventInput) {
  const event: WorkflowDebugEvent = {
    ...input,
    id: createDebugId('event'),
    timestamp: input.timestamp ?? Date.now(),
  }

  events = [...events.slice(-(maxEvents - 1)), event]
  notifyListeners()
  return event
}

export function recordWorkflowSseEvent(response: Response, path: string, data: unknown) {
  return recordWorkflowDebugEvent({
    kind: 'sse-event',
    requestId: responseRequestIds.get(response),
    path,
    data,
  })
}

export function registerWorkflowDebugResponse(response: Response, requestId: string) {
  responseRequestIds.set(response, requestId)
}

export function createWorkflowDebugRequestId() {
  return createDebugId('request')
}

export function subscribeWorkflowDebugEvents(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function getWorkflowDebugEventsSnapshot() {
  return events
}

export function clearWorkflowDebugEvents() {
  if (!events.length) return
  events = []
  notifyListeners()
}

function notifyListeners() {
  for (const listener of listeners) listener()
}

function createDebugId(prefix: string) {
  sequence += 1
  return `${prefix}-${Date.now()}-${sequence}`
}
