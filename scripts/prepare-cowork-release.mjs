import { chmod, cp, mkdir, rm, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { build } from 'esbuild'

const workspaceRoot = resolve(import.meta.dirname, '..')
const sourceDir = resolve(workspaceRoot, '.cowork-release')
const outputDir = resolve(workspaceRoot, '.cowork-release-guard')
const frontendDist = resolve(workspaceRoot, 'apps/red-vedio-flow/dist')

await rm(sourceDir, { recursive: true, force: true })
await rm(outputDir, { recursive: true, force: true })
await mkdir(sourceDir, { recursive: true })
await mkdir(resolve(outputDir, 'public'), { recursive: true })

const sharedBuild = {
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node22',
  banner: {
    js: "import { createRequire as __createRequire } from 'node:module'; const require = __createRequire(import.meta.url);",
  },
  packages: 'bundle',
  external: ['postgres'],
  sourcemap: false,
  minify: false,
  logLevel: 'info',
}

await build({
  ...sharedBuild,
  entryPoints: [resolve(workspaceRoot, 'apps/cowork-server/src/index.ts')],
  outfile: resolve(outputDir, 'server.js'),
})
await build({
  ...sharedBuild,
  entryPoints: [resolve(workspaceRoot, 'apps/cowork-server/src/initDb.ts')],
  outfile: resolve(outputDir, 'init-db.js'),
})
await cp(frontendDist, resolve(outputDir, 'public'), { recursive: true })
const envFile = resolve(workspaceRoot, '.env')
if (existsSync(envFile)) await cp(envFile, resolve(outputDir, '.env'))

await writeFile(resolve(outputDir, 'package.json'), `${JSON.stringify({
  name: 'red-video-flow-cowork',
  version: '1.0.0',
  private: true,
  type: 'module',
  engines: { node: '22.x' },
  dependencies: { postgres: '3.4.9' },
}, null, 2)}\n`)

await writeFile(resolve(outputDir, 'package-lock.json'), `${JSON.stringify({
  name: 'red-video-flow-cowork',
  version: '1.0.0',
  lockfileVersion: 3,
  requires: true,
  packages: {
    '': {
      name: 'red-video-flow-cowork',
      version: '1.0.0',
      dependencies: { postgres: '3.4.9' },
      engines: { node: '22.x' },
    },
    'node_modules/postgres': {
      version: '3.4.9',
      resolved: 'https://registry.npmmirror.com/postgres/-/postgres-3.4.9.tgz',
      integrity: 'sha512-GD3qdB0x1z9xgFI6cdRD6xu2Sp2WCOEoe3mtnyB5Ee0XrrL5Pe+e4CCnJrRMnL1zYtRDZmQQVbvOttLnKDLnaw==',
      license: 'Unlicense',
      engines: { node: '>=12' },
      funding: {
        type: 'individual',
        url: 'https://github.com/sponsors/porsager',
      },
    },
  },
}, null, 2)}\n`)

await writeFile(resolve(outputDir, '.npmrc'), [
  '@xhs:registry=http://npm.devops.xiaohongshu.com:7001',
  'registry=https://registry.npmmirror.com',
  '',
].join('\n'))

await writeFile(resolve(outputDir, 'install.sh'), `#!/usr/bin/env bash
# install.sh - rendered from Cowork guard-transform Node template
set -eo pipefail
cd "$(dirname "$0")"

echo "[install] step: npm ci --omit=dev"
npm ci --omit=dev 2>&1

echo "[install] step: idempotent PostgreSQL initialization"
node init-db.js 2>&1

echo "[install] done"
`)

await writeFile(resolve(outputDir, 'start.sh'), `#!/usr/bin/env bash
# start.sh - rendered from Cowork guard-transform Node template
set -eo pipefail
cd "$(dirname "$0")"

export APP_PORT="\${APP_PORT:-3000}"
exec node server.js 2>&1
`)

await writeFile(resolve(outputDir, 'health.sh'), `#!/bin/sh
# health.sh - rendered from Cowork guard-transform template
curl -fsS -o /dev/null --max-time 3 "http://127.0.0.1:\${APP_PORT:-3000}/health" || exit 1
`)

await Promise.all(['install.sh', 'start.sh', 'health.sh'].map(
  (name) => chmod(resolve(outputDir, name), 0o755),
))

console.log(outputDir)
