import { existsSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'

type RuntimeFile = {
  version: 1
  baseUrl: string
  instanceId: string
  pid: number
}

export async function discoverRuntimeBaseUrl(explicitBaseUrl?: string) {
  if (explicitBaseUrl) return explicitBaseUrl
  if (process.env.RED_VIDEO_FLOW_BASE_URL) return process.env.RED_VIDEO_FLOW_BASE_URL

  for (const filePath of runtimeFileCandidates()) {
    const runtime = readRuntimeFile(filePath)
    if (!runtime || !isProcessAlive(runtime.pid)) continue
    if (await matchesRuntime(runtime)) return runtime.baseUrl
  }

  return 'http://127.0.0.1:5176'
}

function runtimeFileCandidates() {
  const candidates = [
    process.env.RED_VIDEO_FLOW_RUNTIME_FILE,
    platformRuntimeFile(),
    join(homedir(), '.red-video-flow/runtime.json'),
  ].filter((value): value is string => Boolean(value))
  return [...new Set(candidates.map((value) => resolve(value)))]
}

function platformRuntimeFile() {
  if (process.platform === 'darwin') {
    return join(homedir(), 'Library/Application Support/Red Video Flow/runtime.json')
  }
  if (process.platform === 'win32') {
    const appData = process.env.APPDATA
    return appData ? join(appData, 'Red Video Flow/runtime.json') : undefined
  }
  const configHome = process.env.XDG_CONFIG_HOME ?? join(homedir(), '.config')
  return join(configHome, 'red-video-flow/runtime.json')
}

function readRuntimeFile(filePath: string): RuntimeFile | undefined {
  if (!existsSync(filePath)) return undefined
  try {
    const value = JSON.parse(readFileSync(filePath, 'utf8'))
    if (
      value?.version !== 1
      || typeof value.baseUrl !== 'string'
      || typeof value.instanceId !== 'string'
      || typeof value.pid !== 'number'
    ) return undefined
    const url = new URL(value.baseUrl)
    if (!['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)) return undefined
    return value
  } catch {
    return undefined
  }
}

function isProcessAlive(pid: number) {
  if (!Number.isInteger(pid) || pid <= 0) return false
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

async function matchesRuntime(runtime: RuntimeFile) {
  try {
    const response = await fetch(`${runtime.baseUrl}/api/runtime`, {
      signal: AbortSignal.timeout(1_500),
    })
    if (!response.ok) return false
    const remote = await response.json()
    return remote?.instanceId === runtime.instanceId
  } catch {
    return false
  }
}
