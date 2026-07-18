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
    request(path, init) {
      return fetch(`${baseUrl}${path}`, init)
    },
  }
}

export async function readJsonResponse<T>(response: Response, fallbackError: string): Promise<T> {
  if (!response.ok) {
    const error = await response.json().catch(() => undefined)
    throw new Error(error?.error ?? fallbackError)
  }
  return (await response.json()) as T
}
