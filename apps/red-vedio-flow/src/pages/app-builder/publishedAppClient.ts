export type PublishedApp = {
  id: string
  title: string
  isOwner: boolean
  currentReleaseId?: string
  createdAt: number
  updatedAt: number
}

export async function fetchPublishedApps(scope: 'mine' | 'all' = 'mine') {
  return request<{ apps: PublishedApp[] }>(apiUrl(`/api/apps?scope=${scope}`))
}

export async function createPublishedApp(title?: string) {
  return request<{ app: PublishedApp }>(apiUrl('/api/apps'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title }),
  })
}

export async function deletePublishedApp(appId: string) {
  await request<void>(apiUrl(`/api/apps/${encodeURIComponent(appId)}`), { method: 'DELETE' })
}

export async function publishAppRelease(appId: string, input: { title?: string; html: string }) {
  return request<{ release: { id: string; version: number } }>(
    apiUrl(`/api/apps/${encodeURIComponent(appId)}/releases`),
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    },
  )
}

export async function bindDefaultCapability(
  appId: string,
  workflowId: string,
  workflowRevision: number,
  subgraphId: string,
) {
  return request(apiUrl(`/api/apps/${encodeURIComponent(appId)}/capabilities/default`), {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ workflowId, workflowRevision, subgraphId }),
  })
}

export async function createRuntimeSession(appId: string) {
  const result = await request<{ runtimeUrl: string; expiresAt: number }>(
    apiUrl(`/api/apps/${encodeURIComponent(appId)}/runtime-sessions`),
    { method: 'POST' },
  )
  return { ...result, runtimeUrl: resolveRuntimeUrl(result.runtimeUrl) }
}

export function publishedAppUrl(appId: string) {
  return `${publicDeploymentBaseUrl()}/published-app/${encodeURIComponent(appId)}`
}

export function publishedAppPreviewUrl(appId: string) {
  return apiUrl(`/api/apps/${encodeURIComponent(appId)}/preview`)
}

async function request<T = unknown>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init)
  if (!response.ok) {
    const payload = await response.json().catch(() => undefined) as { error?: string } | undefined
    throw new Error(payload?.error || `Request failed with status ${response.status}`)
  }
  if (response.status === 204) return undefined as T
  return response.json() as Promise<T>
}

function apiUrl(path: string) {
  return `${currentDeploymentBasePath()}${path}`
}

function resolveRuntimeUrl(value: string) {
  const url = new URL(value, window.location.origin)
  if (!url.pathname.startsWith('/runtime/')) return url.toString()
  const base = new URL(publicDeploymentBaseUrl())
  return `${base.origin}${base.pathname.replace(/\/$/, '')}${url.pathname}${url.search}`
}

function publicDeploymentBaseUrl() {
  const configured = typeof __RED_VIDEO_FLOW_PUBLIC_BASE_URL__ === 'string'
    ? __RED_VIDEO_FLOW_PUBLIC_BASE_URL__.replace(/\/$/, '')
    : ''
  return configured || `${window.location.origin}${currentDeploymentBasePath()}`
}

function currentDeploymentBasePath() {
  return window.location.pathname.match(/^\/s\/[^/]+/)?.[0] ?? ''
}
