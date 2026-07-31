export function resolveAgentResourceUrl(url: string): string
export function resolveAgentResourceUrl(url?: string): string | undefined
export function resolveAgentResourceUrl(url?: string) {
  if (!url || typeof window === 'undefined') return url
  if (/^[a-z][a-z\d+.-]*:/i.test(url)) return url
  if (url.startsWith('//')) return `${window.location.protocol}${url}`

  const deploymentBasePath = window.location.pathname.match(/^\/s\/[^/]+/)?.[0] ?? ''
  const resourcePath = url.startsWith('/') ? url : `/${url}`
  const path = deploymentBasePath && !resourcePath.startsWith(`${deploymentBasePath}/`)
    ? `${deploymentBasePath}${resourcePath}`
    : resourcePath

  return new URL(path, window.location.origin).href
}
