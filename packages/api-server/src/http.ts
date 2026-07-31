import type { IncomingMessage, ServerResponse } from 'node:http'

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

export async function readBuffer(
  req: IncomingMessage,
  maxBytes = 100 * 1024 * 1024,
) {
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

export async function readJson(
  req: IncomingMessage,
  maxBytes = 4 * 1024 * 1024,
): Promise<Record<string, any>> {
  const raw = (await readBuffer(req, maxBytes)).toString('utf8')
  if (!raw) return {}
  try {
    const value = JSON.parse(raw)
    if (!isRecord(value)) throw new Error('JSON body must be an object')
    return value
  } catch {
    throw new HttpError(400, 'request body must be valid JSON')
  }
}

export function sendJson(res: ServerResponse, status: number, value: unknown) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'content-type,range',
  })
  res.end(JSON.stringify(value))
}

export function writeSse(res: ServerResponse, event: unknown) {
  res.write(`data: ${JSON.stringify(event)}\n\n`)
}

export function pathParts(pathname: string, prefix: string) {
  if (!pathname.startsWith(prefix)) return undefined
  return pathname
    .slice(prefix.length)
    .split('/')
    .filter(Boolean)
    .map((part) => decodeURIComponent(part))
}

export function isRecord(value: unknown): value is Record<string, any> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

export function optionalString(value: unknown) {
  return typeof value === 'string' ? value : undefined
}
