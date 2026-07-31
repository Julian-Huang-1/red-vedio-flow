import type { IncomingMessage } from 'node:http'
import type { AppUser, AuthenticatedUser } from '@red-video-flow/workflow-core'
import type { CoworkRuntime } from './runtime.js'
import { HttpError } from './http.js'

export function parseSsoUser(value: string | string[] | undefined): AuthenticatedUser {
  const raw = Array.isArray(value) ? value[0] : value
  if (!raw) throw new HttpError(401, 'SSO login is required')
  let parsed: unknown
  try {
    parsed = JSON.parse(Buffer.from(raw, 'latin1').toString('utf8'))
  } catch {
    throw new HttpError(401, 'invalid SSO user header')
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new HttpError(401, 'invalid SSO user header')
  }
  const record = parsed as Record<string, unknown>
  const ssoId = firstText(record.userId, record.id)
  const username = firstText(record.username, record.name, record.displayName)
  const email = firstText(record.email, record.workEmail)
  if (!ssoId || !username || !email) throw new HttpError(401, 'incomplete SSO user header')
  return { ssoId, username, email }
}

export async function requireUser(runtime: CoworkRuntime, req: IncomingMessage): Promise<AppUser> {
  return runtime.infrastructure.users.upsertFromSso(
    parseSsoUser(req.headers['decrypted-userinfo']),
  )
}

function text(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function firstText(...values: unknown[]) {
  for (const value of values) {
    const resolved = text(value)
    if (resolved) return resolved
  }
  return undefined
}
