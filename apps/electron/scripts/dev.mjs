import { spawn, spawnSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const scriptPath = fileURLToPath(import.meta.url)
const electronDir = resolve(dirname(scriptPath), '..')
const repoRoot = resolve(electronDir, '../..')
const nodeVersion = readFileSync(resolve(repoRoot, '.nvmrc'), 'utf8').trim()

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
}

const build = spawn('pnpm', ['--filter', '@red-video-flow/electron', 'build'], {
  cwd: repoRoot,
  env: process.env,
  stdio: 'inherit',
})
const buildCode = await new Promise((resolveExit) => build.once('exit', resolveExit))
if (buildCode !== 0) process.exit(buildCode ?? 1)

const electron = spawn('pnpm', ['--dir', electronDir, 'exec', 'electron', '.'], {
  cwd: repoRoot,
  env: {
    ...process.env,
    RED_VIDEO_FLOW_DEV_NODE: process.execPath,
  },
  stdio: 'inherit',
})

const shutdown = () => electron.kill('SIGTERM')
process.once('SIGINT', shutdown)
process.once('SIGTERM', shutdown)
const electronCode = await new Promise((resolveExit) => electron.once('exit', resolveExit))
process.exit(electronCode ?? 0)
