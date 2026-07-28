import {
  createWorkflowDebugRequestId,
  recordWorkflowDebugEvent,
  registerWorkflowDebugResponse,
} from './debugEvents'

export type WorkflowClientTransport = {
  request(path: string, init?: RequestInit): Promise<Response>
}

let transport: WorkflowClientTransport = createHttpTransport()

export function configureWorkflowClient(nextTransport: WorkflowClientTransport) {
  transport = nextTransport
}

export function getWorkflowClientTransport() {
  return transport
}

export function createHttpTransport(options: { baseUrl?: string } = {}): WorkflowClientTransport {
  const baseUrl = options.baseUrl ?? ''
  return {
    async request(path, init) {
      const method = (init?.method ?? 'GET').toUpperCase()
      const requestId = createWorkflowDebugRequestId()
      const startedAt = Date.now()

      recordWorkflowDebugEvent({
        kind: 'http-request',
        requestId,
        path,
        method,
        data: summarizeRequestBody(init?.body),
      })

      try {
        const response = await fetch(`${baseUrl}${path}`, init)
        const durationMs = Date.now() - startedAt
        registerWorkflowDebugResponse(response, requestId)
        recordWorkflowDebugEvent({
          kind: 'http-response',
          requestId,
          path,
          method,
          status: response.status,
          durationMs,
          data: {
            contentType: response.headers.get('content-type'),
            contentLength: response.headers.get('content-length'),
          },
        })
        captureResponseBody(response, { requestId, path, method, status: response.status, durationMs })
        return response
      } catch (error) {
        recordWorkflowDebugEvent({
          kind: 'http-error',
          requestId,
          path,
          method,
          durationMs: Date.now() - startedAt,
          data: {
            message: error instanceof Error ? error.message : String(error),
          },
        })
        throw error
      }
    },
  }
}

export class WorkflowClientResponseError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly payload?: unknown,
  ) {
    super(message)
    this.name = 'WorkflowClientResponseError'
  }
}

export async function readJsonResponse<T>(response: Response, fallbackError: string): Promise<T> {
  if (!response.ok) {
    const error = await response.json().catch(() => undefined)
    throw new WorkflowClientResponseError(error?.error ?? fallbackError, response.status, error)
  }
  return (await response.json()) as T
}

function captureResponseBody(
  response: Response,
  meta: { requestId: string; path: string; method: string; status: number; durationMs: number },
) {
  const contentType = response.headers.get('content-type') ?? ''
  if (contentType.includes('text/event-stream')) return
  if (!contentType.includes('application/json') && !contentType.startsWith('text/')) return

  void response.clone().text().then((text) => {
    if (!text) return
    recordWorkflowDebugEvent({
      kind: 'http-response-body',
      ...meta,
      data: parseDebugText(text),
    })
  }).catch(() => undefined)
}

function summarizeRequestBody(body: BodyInit | null | undefined) {
  if (body == null) return undefined
  if (typeof body === 'string') return parseDebugText(body)
  if (body instanceof URLSearchParams) return Object.fromEntries(body.entries())
  if (typeof FormData !== 'undefined' && body instanceof FormData) {
    const entries: Array<[string, string]> = []
    body.forEach((value, key) => {
      entries.push([
        key,
        typeof value === 'string' ? value : `[File ${value.name || 'unnamed'} · ${value.size} bytes]`,
      ])
    })
    return Object.fromEntries(entries)
  }
  if (typeof Blob !== 'undefined' && body instanceof Blob) {
    return `[Blob ${body.type || 'application/octet-stream'} · ${body.size} bytes]`
  }
  return `[${body.constructor?.name ?? 'Request body'}]`
}

function parseDebugText(text: string) {
  const maxLength = 20_000
  const normalized = text.length > maxLength
    ? `${text.slice(0, maxLength)}\n…已截断 ${text.length - maxLength} 个字符`
    : text

  try {
    return JSON.parse(normalized)
  } catch {
    return normalized
  }
}
