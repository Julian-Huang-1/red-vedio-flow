import type { IncomingMessage, ServerResponse } from 'node:http'
import { createReadStream } from 'node:fs'
import type { ExecutionEvent } from '@red-video-flow/plugin-contract'
import { contentTypeFor } from '@red-video-flow/local-backend'

export type RequestContext = {
  req: IncomingMessage
  res: ServerResponse
  url: URL
  pathname: string
}

export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message)
    this.name = 'HttpError'
  }
}

export async function readBuffer(req: IncomingMessage, maxBytes = Number.POSITIVE_INFINITY) {
  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    size += buffer.length
    if (size > maxBytes) throw new HttpError(413, 'request body is too large')
    chunks.push(buffer)
  }
  return Buffer.concat(chunks)
}

export async function readJson(req: IncomingMessage, maxBytes = 2 * 1024 * 1024) {
  const body = (await readBuffer(req, maxBytes)).toString('utf8')
  if (!body) return {}
  try {
    return JSON.parse(body)
  } catch {
    throw new HttpError(400, 'request body must be valid JSON')
  }
}

export function sendJson(res: ServerResponse, status: number, payload: unknown) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'content-type',
  })
  res.end(JSON.stringify(payload))
}

export function writeSse(res: ServerResponse, event: unknown) {
  res.write(`data: ${JSON.stringify(event)}\n\n`)
}

export function writeExecutionSse(res: ServerResponse, event: ExecutionEvent) {
  res.write(`id: ${event.sequence}\n`)
  res.write(`event: ${event.type}\n`)
  res.write(`data: ${JSON.stringify(event)}\n\n`)
}

export function sendStaticFile(res: ServerResponse, filePath: string) {
  res.writeHead(200, { 'Content-Type': contentTypeFor(filePath) })
  createReadStream(filePath).pipe(res)
}

export function resourcePath(pathname: string, prefix: string) {
  if (!pathname.startsWith(prefix)) return undefined
  return pathname
    .slice(prefix.length)
    .split('/')
    .filter(Boolean)
    .map((part) => decodeURIComponent(part))
}
