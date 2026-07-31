import type { IncomingMessage, ServerResponse } from 'node:http'
import { createReadStream } from 'node:fs'
import type { ExecutionEvent } from '@red-video-flow/plugin-contract'
import { contentTypeFor } from '@red-video-flow/local-backend'
export {
  HttpError,
  pathParts as resourcePath,
  readBuffer,
  readJson,
  sendJson,
  writeSse,
  type RequestContext,
} from '@red-video-flow/api-server'

export function writeExecutionSse(res: ServerResponse, event: ExecutionEvent) {
  res.write(`id: ${event.sequence}\n`)
  res.write(`event: ${event.type}\n`)
  res.write(`data: ${JSON.stringify(event)}\n\n`)
}

export function sendStaticFile(res: ServerResponse, filePath: string) {
  res.writeHead(200, { 'Content-Type': contentTypeFor(filePath) })
  createReadStream(filePath).pipe(res)
}
