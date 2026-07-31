import type { IncomingMessage } from 'node:http'
import type { AppUser, AuthenticatedUser } from '@red-video-flow/workflow-core'
import type { LocalServerRuntime } from './runtime.js'
import { HttpError } from './http.js'

export function parseSsoUser(headerValue: string | string[] | undefined): AuthenticatedUser | undefined {
  const raw = Array.isArray(headerValue) ? headerValue[0] : headerValue
  if (!raw) return undefined
  let value: unknown
  try {
    value = JSON.parse(Buffer.from(raw, 'latin1').toString('utf8'))
  } catch {
    throw new HttpError(401, 'invalid SSO user header')
  }
  if (!isRecord(value)) throw new HttpError(401, 'invalid SSO user header')
  const ssoId = stringValue(value.userId) ?? stringValue(value.ssoId)
  const username = stringValue(value.username)
  const email = stringValue(value.email)
  if (!ssoId || !username || !email) throw new HttpError(401, 'incomplete SSO user header')
  return { ssoId, username, email }
}

export async function requireRequestUser(
  runtime: LocalServerRuntime,
  req: IncomingMessage,
): Promise<AppUser> {
  const user = parseSsoUser(req.headers['decrypted-userinfo'])
  if (user) return runtime.backend.users.upsertFromSso(user)
  if (runtime.config.deploymentMode === 'cowork' || runtime.config.requireSso) {
    throw new HttpError(401, 'SSO login is required')
  }
  return runtime.backend.users.upsertFromSso({
    ssoId: 'local-development-user',
    username: 'Local User',
    email: 'local@red-video-flow.invalid',
  })
}

export async function resolveRequestUser(
  runtime: LocalServerRuntime,
  req: IncomingMessage,
): Promise<AppUser | undefined> {
  const user = parseSsoUser(req.headers['decrypted-userinfo'])
  if (!user) {
    if (runtime.config.deploymentMode === 'cowork' || runtime.config.requireSso) {
      throw new HttpError(401, 'SSO login is required')
    }
    return runtime.backend.users.upsertFromSso({
      ssoId: 'local-development-user',
      username: 'Local User',
      email: 'local@red-video-flow.invalid',
    })
  }
  return runtime.backend.users.upsertFromSso(user)
}

function stringValue(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}
