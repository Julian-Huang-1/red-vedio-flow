import { spawnSync } from 'node:child_process'
import { chmod, cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
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
await cp(
  resolve(repoRoot, 'apps/red-vedio-flow/dist'),
  resolve(stageDir, 'web-dist'),
  { recursive: true },
)
await cp(resolve(repoRoot, 'plugins'), resolve(stageDir, 'builtin-plugins'), { recursive: true })
await cp(resolve(electronDir, 'dist/rvf'), resolve(stageDir, 'rvf'), { recursive: true })
await mkdir(resolve(stageDir, 'bin'), { recursive: true })
await writeFile(resolve(stageDir, 'bin/rvf'), `#!/bin/sh
SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
if [ "$(uname -s)" = "Darwin" ]; then
  APP_EXECUTABLE="$SCRIPT_DIR/../../MacOS/Red Video Flow"
else
  APP_EXECUTABLE="\${RVF_ELECTRON_EXECUTABLE:-$SCRIPT_DIR/../../red-video-flow}"
fi
ELECTRON_RUN_AS_NODE=1 exec "$APP_EXECUTABLE" "$SCRIPT_DIR/../rvf/rvf.js" "$@"
`)
await chmod(resolve(stageDir, 'bin/rvf'), 0o755)
await writeFile(resolve(stageDir, 'bin/rvf.cmd'), `@echo off
set ELECTRON_RUN_AS_NODE=1
"%~dp0\\..\\..\\Red Video Flow.exe" "%~dp0\\..\\rvf\\rvf.js" %*
`)

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
    extraResources: [
      { from: 'web-dist', to: 'web-dist' },
      { from: 'builtin-plugins', to: 'builtin-plugins' },
      { from: 'rvf', to: 'rvf' },
      { from: 'bin', to: 'bin' },
    ],
    directories: { output: resolve(electronDir, 'release') },
    mac: sourcePackage.build.mac,
    win: sourcePackage.build.win,
    linux: sourcePackage.build.linux,
    nsis: sourcePackage.build.nsis,
  },
}

await writeFile(resolve(stageDir, 'package.json'), `${JSON.stringify(stagePackage, null, 2)}\n`)
run('npm', ['install', '--omit=dev', '--ignore-scripts', '--no-audit', '--no-fund'], stageDir)
