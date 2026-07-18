import { spawnSync } from 'node:child_process'
import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const electronDir = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const repoRoot = resolve(electronDir, '../..')
const stageDir = process.env.RED_VIDEO_FLOW_ELECTRON_STAGE_DIR ?? '/tmp/red-video-flow-electron-stage'
const sourcePackage = JSON.parse(await readFile(resolve(electronDir, 'package.json'), 'utf8'))

function exact(versionRange) {
  return versionRange.replace(/^[~^]/, '')
}

function run(command, args, cwd) {
  const result = spawnSync(command, args, {
    cwd,
    stdio: 'inherit',
    env: process.env,
  })
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(' ')} failed`)
  }
}

await rm(stageDir, { recursive: true, force: true })
await mkdir(stageDir, { recursive: true })
await mkdir(resolve(stageDir, 'dist'), { recursive: true })
await cp(resolve(electronDir, 'dist/main.js'), resolve(stageDir, 'dist/main.js'))
await cp(resolve(repoRoot, 'apps/web/dist'), resolve(stageDir, 'web-dist'), { recursive: true })

const stagePackage = {
  name: sourcePackage.name,
  private: true,
  version: sourcePackage.version,
  description: sourcePackage.description,
  type: sourcePackage.type,
  main: sourcePackage.main,
  dependencies: {
    'better-sqlite3': sourcePackage.dependencies['better-sqlite3'],
  },
  build: {
    appId: sourcePackage.build.appId,
    productName: sourcePackage.build.productName,
    electronVersion: exact(sourcePackage.devDependencies.electron),
    asar: sourcePackage.build.asar,
    asarUnpack: sourcePackage.build.asarUnpack,
    files: sourcePackage.build.files,
    extraResources: [{ from: 'web-dist', to: 'web-dist' }],
    directories: { output: resolve(electronDir, 'release') },
    mac: sourcePackage.build.mac,
    win: sourcePackage.build.win,
    linux: sourcePackage.build.linux,
    nsis: sourcePackage.build.nsis,
  },
}

await writeFile(resolve(stageDir, 'package.json'), `${JSON.stringify(stagePackage, null, 2)}\n`)
run('npm', ['install', '--omit=dev', '--ignore-scripts', '--no-audit', '--no-fund'], stageDir)
