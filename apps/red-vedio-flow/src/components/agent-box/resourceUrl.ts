export function resolveAgentResourceUrl(url: string): string
export function resolveAgentResourceUrl(url?: string): string | undefined
export function resolveAgentResourceUrl(url?: string) {
  if (!url || typeof window === 'undefined') return url
  if (/^[a-z][a-z\d+.-]*:/i.test(url)) return url
  const configuredBaseUrl = typeof __RED_VIDEO_FLOW_PUBLIC_BASE_URL__ === 'string'
    ? __RED_VIDEO_FLOW_PUBLIC_BASE_URL__.replace(/\/+$/, '')
    : ''
  const currentDeploymentBasePath = window.location.pathname.match(/^\/s\/[^/]+/)?.[0] ?? ''
  const baseUrl = configuredBaseUrl || `${window.location.origin}${currentDeploymentBasePath}`
  if (url.startsWith('//')) return `${new URL(baseUrl).protocol}${url}`

  const resourcePath = url.startsWith('/') ? url : `/${url}`
  return `${baseUrl}${resourcePath}`
}
