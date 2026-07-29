import { existsSync, statSync } from 'node:fs'
import { isAbsolute, join, normalize, relative } from 'node:path'
import { contentTypeFor } from '@red-video-flow/local-backend'
import type { LocalServerRuntime } from '../runtime.js'
import { sendStaticFile, type RequestContext } from '../http.js'

export async function handleStaticRoutes(runtime: LocalServerRuntime, ctx: RequestContext) {
  const { req, res, pathname } = ctx
  if (req.method !== 'GET' && req.method !== 'HEAD') return false

  const distDir = runtime.config.distDir
  const requestedPath = normalize(join(distDir, decodeURIComponent(pathname)))
  if (isInside(distDir, requestedPath) && existsSync(requestedPath) && statSync(requestedPath).isFile()) {
    if (req.method === 'HEAD') {
      res.writeHead(200, { 'Content-Type': contentTypeFor(requestedPath) })
      res.end()
      return true
    }
    sendStaticFile(res, requestedPath)
    return true
  }

  const indexPath = join(distDir, 'index.html')
  if (!existsSync(indexPath)) return false
  if (req.method === 'HEAD') {
    res.writeHead(200, { 'Content-Type': contentTypeFor(indexPath) })
    res.end()
    return true
  }
  sendStaticFile(res, indexPath)
  return true
}

function isInside(parent: string, child: string) {
  const path = relative(parent, child)
  return path === '' || (!path.startsWith('..') && !isAbsolute(path))
}
