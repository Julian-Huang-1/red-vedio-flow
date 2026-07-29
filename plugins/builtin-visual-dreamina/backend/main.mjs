import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync } from 'node:fs'
import { homedir } from 'node:os'
import path from 'node:path'
import readline from 'node:readline'

const lines = readline.createInterface({ input: process.stdin, crlfDelay: Infinity })
const active = new Map()

function send(value) {
  process.stdout.write(`${JSON.stringify(value)}\n`)
}

function respond(id, result) {
  send({ jsonrpc: '2.0', id, result: result ?? null })
}

function fail(id, error) {
  send({
    jsonrpc: '2.0',
    id,
    error: {
      code: error?.code ?? 'DREAMINA_ERROR',
      message: error instanceof Error ? error.message : String(error),
      retryable: true,
    },
  })
}

function emit(executionId, type, data) {
  send({
    jsonrpc: '2.0',
    method: 'execution.event',
    params: { executionId, type, data },
  })
}

lines.on('line', (line) => {
  void handle(JSON.parse(line))
})

async function handle(request) {
  try {
    if (request.method === 'plugin.initialize') return respond(request.id, { ready: true })
    if (request.method === 'plugin.activate') return respond(request.id, { active: true })
    if (request.method === 'plugin.health') {
      const binPath = resolveOnPath('dreamina')
      return respond(request.id, {
        ok: Boolean(binPath),
        available: Boolean(binPath),
        binPath,
        activeExecutions: active.size,
      })
    }
    if (request.method === 'plugin.deactivate') return respond(request.id, { active: false })
    if (request.method === 'plugin.dispose') {
      for (const child of active.values()) child.kill('SIGTERM')
      respond(request.id, { disposed: true })
      setTimeout(() => process.exit(0), 0)
      return
    }
    if (request.method === 'execution.cancel' || request.method === 'visual.cancel') {
      const child = active.get(request.params?.executionId)
      if (child) child.kill('SIGTERM')
      return respond(request.id, { cancelled: Boolean(child) })
    }
    if (request.method === 'visual.describe') {
      const binPath = resolveOnPath('dreamina')
      return respond(request.id, { available: Boolean(binPath), binPath })
    }
    if (request.method === 'visual.submit') {
      const input = request.params?.input ?? request.params ?? {}
      return respond(request.id, await submit({
        executionId: request.params?.executionId ?? input.executionId,
        ...input,
      }))
    }
    if (request.method === 'visual.query') {
      const input = request.params?.input ?? request.params ?? {}
      return respond(request.id, await query({
        executionId: request.params?.executionId ?? input.executionId,
        ...input,
      }))
    }
    if (request.method === 'command.execute') {
      const input = request.params?.input ?? {}
      return respond(request.id, await submit({
        executionId: request.params?.executionId,
        ...input,
      }))
    }
    throw Object.assign(new Error(`unknown method: ${request.method}`), { code: 'METHOD_NOT_FOUND' })
  } catch (error) {
    fail(request.id, error)
  }
}

async function submit({ executionId, capability, prompt, inputs = [], options = {} }) {
  const bin = requireDreamina()
  const downloadDir = options.downloadDir ?? path.join(process.cwd(), '.generated', executionId)
  mkdirSync(downloadDir, { recursive: true })
  const argv = buildSubmitArgv({ capability, prompt, inputs, options, downloadDir })
  emit(executionId, 'progress', { phase: 'spawned', bin, argv })
  const result = await runCli(executionId, bin, argv)
  if (result.code !== 0) throw new Error(result.stderr.trim() || result.stdout.trim() || `dreamina exited with ${result.code}`)

  const parsed = firstJsonObject(result.stdout)
  const externalTaskId = findValueDeep(parsed, ['submit_id', 'submitId', 'id'])
  const assets = collectAssets(downloadDir, parsed)
  if (assets.length) return { status: 'completed', assets, text: result.stdout.trim() }
  if (externalTaskId) {
    emit(executionId, 'submitted', { externalTaskId })
    return { status: 'pending', externalTaskId, text: result.stdout.trim() }
  }
  const status = normalizedStatus(findValueDeep(parsed, ['gen_status', 'genStatus', 'status']))
  if (status === 'failed') throw new Error(findValueDeep(parsed, ['fail_reason', 'failReason']) ?? 'Dreamina generation failed')
  throw new Error('Dreamina returned neither media nor a submit ID')
}

async function query({ executionId, externalTaskId, options = {} }) {
  const bin = requireDreamina()
  const downloadDir = options.downloadDir ?? path.join(process.cwd(), '.generated', `task-${externalTaskId}`)
  mkdirSync(downloadDir, { recursive: true })
  const argv = ['query_result', `--submit_id=${externalTaskId}`, `--download_dir=${downloadDir}`]
  const result = await runCli(executionId, bin, argv)
  if (result.code !== 0) throw new Error(result.stderr.trim() || result.stdout.trim() || `dreamina exited with ${result.code}`)

  const parsed = firstJsonObject(result.stdout)
  const assets = collectAssets(downloadDir, parsed)
  if (assets.length) return { status: 'succeeded', assets, text: result.stdout.trim() }
  const providerStatus = findValueDeep(parsed, ['gen_status', 'genStatus', 'status'])
  const status = normalizedStatus(providerStatus)
  if (status === 'failed') {
    return {
      status: 'failed',
      code: 'DREAMINA_TASK_FAILED',
      message: findValueDeep(parsed, ['fail_reason', 'failReason', 'error_message']) ?? 'Dreamina task failed',
    }
  }
  return { status: 'pending', text: result.stdout.trim() }
}

function runCli(executionId, bin, argv) {
  return new Promise((resolveRun, rejectRun) => {
    const child = spawn(bin, argv, {
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: process.platform === 'win32',
    })
    active.set(executionId, child)
    let stdout = ''
    let stderr = ''
    child.stdout.setEncoding('utf8')
    child.stderr.setEncoding('utf8')
    child.stdout.on('data', (text) => {
      stdout += text
      emit(executionId, 'progress', { stream: 'stdout', text })
    })
    child.stderr.on('data', (text) => {
      stderr += text
      emit(executionId, 'stderr', { text })
    })
    child.on('error', rejectRun)
    child.on('close', (code, signal) => {
      active.delete(executionId)
      resolveRun({ code, signal, stdout, stderr })
    })
  })
}

function buildSubmitArgv({ capability, prompt, inputs, options, downloadDir }) {
  const images = inputs.flatMap((asset) => asset.localPath ? [asset.localPath] : [])
  const image = images[0]
  const common = [`--prompt=${prompt}`]
  if (capability === 'image-to-image' || (capability === 'text-to-image' && image)) {
    return ['image2image', '--images', image, ...common, `--ratio=${options.ratio ?? '9:16'}`, `--resolution_type=${options.resolution ?? '2k'}`, '--poll=60']
  }
  if (capability === 'text-to-image') {
    return ['text2image', ...common, `--ratio=${options.ratio ?? '9:16'}`, `--resolution_type=${options.resolution ?? '2k'}`, '--poll=60']
  }
  if (capability === 'image-to-video' || (capability === 'text-to-video' && image)) {
    return ['image2video', '--image', image, ...common, `--duration=${options.duration ?? 5}`, '--poll=60']
  }
  if (capability === 'text-to-video') {
    return ['text2video', ...common, `--duration=${options.duration ?? 5}`, `--ratio=${options.ratio ?? '9:16'}`, `--video_resolution=${options.resolution ?? '720p'}`, '--poll=60']
  }
  if (capability === 'frames-to-video' && images.length >= 2) {
    return [
      'frames2video',
      '--first',
      images[0],
      '--last',
      images[1],
      ...common,
      `--duration=${options.duration ?? 5}`,
      '--poll=60',
    ]
  }
  if (capability === 'image-upscale' && image) {
    return [
      'image_upscale',
      '--image',
      image,
      `--resolution_type=${options.resolution ?? '2k'}`,
      '--poll=60',
    ]
  }
  throw new Error(`unsupported Dreamina capability: ${String(capability)}`)
}

function collectAssets(downloadDir, parsed) {
  const downloaded = existsSync(downloadDir)
    ? readdirSync(downloadDir)
        .filter((name) => /\.(png|jpe?g|webp|gif|mp4|mov|m4v)$/i.test(name))
        .map((name) => ({
          localPath: path.join(downloadDir, name),
          fileName: name,
          mimeType: mimeType(name),
        }))
    : []
  if (downloaded.length) return downloaded
  const remoteUrl = findMediaUrl(parsed)
  return remoteUrl ? [{ remoteUrl, mimeType: mimeType(remoteUrl) }] : []
}

function requireDreamina() {
  const bin = resolveOnPath('dreamina')
  if (!bin) throw new Error('dreamina CLI is not installed or is not on PATH')
  return bin
}

function resolveOnPath(bin) {
  if (path.isAbsolute(bin)) return existsSync(bin) ? bin : null
  const directories = new Set((process.env.PATH ?? '').split(path.delimiter).filter(Boolean))
  for (const value of ['~/.local/bin', '~/Library/pnpm', '/opt/homebrew/bin', '/usr/local/bin']) {
    directories.add(value.startsWith('~/') ? path.join(homedir(), value.slice(2)) : value)
  }
  for (const directory of directories) {
    const candidate = path.join(directory, bin)
    if (existsSync(candidate)) return candidate
  }
  return null
}

function firstJsonObject(text) {
  const value = text.trim()
  if (!value) return null
  try {
    return JSON.parse(value)
  } catch {}
  const start = value.indexOf('{')
  const end = value.lastIndexOf('}')
  if (start === -1 || end <= start) return null
  try {
    return JSON.parse(value.slice(start, end + 1))
  } catch {
    return null
  }
}

function findValueDeep(value, keys) {
  if (!value || typeof value !== 'object') return undefined
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findValueDeep(item, keys)
      if (found) return found
    }
    return undefined
  }
  for (const [key, child] of Object.entries(value)) {
    if (keys.includes(key) && ['string', 'number'].includes(typeof child)) return String(child)
    const found = findValueDeep(child, keys)
    if (found) return found
  }
  return undefined
}

function findMediaUrl(value) {
  if (!value || typeof value !== 'object') return undefined
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findMediaUrl(item)
      if (found) return found
    }
    return undefined
  }
  for (const [key, child] of Object.entries(value)) {
    if (typeof child === 'string' && /^https?:\/\//.test(child) && (/url|uri|image|video|download/i.test(key) || /\.(png|jpe?g|webp|mp4|mov)(\?|$)/i.test(child))) {
      return child
    }
    const found = findMediaUrl(child)
    if (found) return found
  }
  return undefined
}

function normalizedStatus(value) {
  const status = value?.toLowerCase()
  if (['failed', 'fail', 'error', 'cancelled', 'canceled', 'rejected'].includes(status)) return 'failed'
  if (['success', 'succeeded', 'done', 'completed', 'complete', 'finished'].includes(status)) return 'succeeded'
  return 'pending'
}

function mimeType(value) {
  const extension = path.extname(new URL(value, 'file:///').pathname).toLowerCase()
  if (extension === '.png') return 'image/png'
  if (extension === '.jpg' || extension === '.jpeg') return 'image/jpeg'
  if (extension === '.webp') return 'image/webp'
  if (extension === '.gif') return 'image/gif'
  if (extension === '.mp4') return 'video/mp4'
  if (extension === '.mov') return 'video/quicktime'
  if (extension === '.m4v') return 'video/x-m4v'
  return 'application/octet-stream'
}
