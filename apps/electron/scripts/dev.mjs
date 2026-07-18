import { spawn, spawnSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { setTimeout as delay } from 'node:timers/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const scriptPath = fileURLToPath(import.meta.url)
const electronDir = resolve(dirname(scriptPath), '..')
const repoRoot = resolve(electronDir, '../..')
const nodeVersion = readFileSync(resolve(repoRoot, '.nvmrc'), 'utf8').trim()
const viteUrl = process.env.RED_VIDEO_FLOW_ELECTRON_DEV_URL ?? 'http://127.0.0.1:5175'
const backendHealthUrl = process.env.RED_VIDEO_FLOW_BACKEND_HEALTH_URL ?? 'http://127.0.0.1:5176/api/health'
const children = new Set()

if (!process.env.RED_VIDEO_FLOW_NVM_REEXEC && !process.version.startsWith(`v${nodeVersion}`)) {
  const nvmDir = process.env.NVM_DIR ?? resolve(process.env.HOME ?? '', '.nvm')
  const nvmScript = resolve(nvmDir, 'nvm.sh')

  if (existsSync(nvmScript)) {
    const command = `source ${JSON.stringify(nvmScript)} && nvm use ${JSON.stringify(nodeVersion)} >/dev/null && node ${JSON.stringify(scriptPath)}`
    const result = spawnSync('zsh', ['-lc', command], {
      cwd: repoRoot,
      env: { ...process.env, RED_VIDEO_FLOW_NVM_REEXEC: '1' },
      stdio: 'inherit',
    })
    process.exit(result.status ?? 1)
  }

  console.warn(`[red-video-flow] expected Node ${nodeVersion}, current ${process.version}; continuing without nvm auto-switch`)
}

function run(command, args, options = {}) {
  const child = spawn(command, args, {
    cwd: options.cwd ?? repoRoot,
    env: { ...process.env, ...options.env },
    stdio: options.stdio ?? 'inherit',
  })
  children.add(child)
  child.on('exit', () => children.delete(child))
  return child
}

function waitForExit(child) {
  return new Promise((resolveExit, rejectExit) => {
    child.once('exit', (code, signal) => {
      if (code === 0) resolveExit()
      else rejectExit(new Error(`${child.spawnargs.join(' ')} exited with ${signal ?? code}`))
    })
    child.once('error', rejectExit)
  })
}

async function waitForHttp(url, label) {
  const timeoutAt = Date.now() + 60_000
  let lastError

  while (Date.now() < timeoutAt) {
    try {
      const response = await fetch(url)
      if (response.ok) return
      lastError = new Error(`${label} returned HTTP ${response.status}`)
    } catch (error) {
      lastError = error
    }
    await delay(500)
  }

  throw new Error(`Timed out waiting for ${label} at ${url}: ${lastError?.message ?? 'unknown error'}`)
}

function shutdown() {
  for (const child of children) child.kill('SIGTERM')
}

process.once('SIGINT', () => {
  shutdown()
  process.exit(130)
})
process.once('SIGTERM', () => {
  shutdown()
  process.exit(143)
})
process.once('exit', shutdown)

const backend = run('pnpm', ['--filter', '@red-video-flow/local-server', 'dev'])
const web = run('pnpm', ['--filter', '@red-video-flow/web', 'dev'])

try {
  await Promise.all([
    waitForHttp(backendHealthUrl, 'local backend'),
    waitForHttp(viteUrl, 'Vite web'),
  ])

  const build = run('pnpm', ['--filter', '@red-video-flow/electron', 'build'])
  await waitForExit(build)

  const electron = run('pnpm', ['--dir', electronDir, 'exec', 'electron', '.'], {
    env: { RED_VIDEO_FLOW_ELECTRON_DEV_URL: viteUrl },
  })
  await waitForExit(electron)
} finally {
  shutdown()
}
