import { chmodSync, mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { delimiter, dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'
import { PluginManager } from './pluginManager'
import { PluginVisualService } from './pluginVisualService'

const testDir = dirname(fileURLToPath(import.meta.url))
const workspaceRoot = resolve(testDir, '../../../..')
const dreaminaPlugin = join(workspaceRoot, 'plugins/builtin-visual-dreamina/backend/main.mjs')
const originalPath = process.env.PATH
let manager: PluginManager | undefined
let root: string | undefined

afterEach(async () => {
  await manager?.close()
  manager = undefined
  process.env.PATH = originalPath
  if (root) rmSync(root, { recursive: true, force: true })
  root = undefined
})

describe('PluginVisualService', () => {
  it('submits and queries Dreamina exclusively through the built-in process plugin', async () => {
    root = mkdtempSync(join(tmpdir(), 'rvf-plugin-visual-'))
    const binDir = join(root, 'bin')
    const pluginDir = join(root, 'plugins/dreamina')
    mkdirSync(binDir, { recursive: true })
    mkdirSync(pluginDir, { recursive: true })
    const fakeDreamina = join(binDir, 'dreamina')
    writeFileSync(fakeDreamina, `#!/bin/sh
download_dir=""
for arg in "$@"; do
  case "$arg" in
    --download_dir=*) download_dir="\${arg#--download_dir=}" ;;
  esac
done
if [ "$1" = "query_result" ]; then
  mkdir -p "$download_dir"
  printf 'fake-video' > "$download_dir/result.mp4"
  printf '%s\\n' '{"submit_id":"submit-1","gen_status":"success"}'
else
  printf '%s\\n' '{"submit_id":"submit-1","gen_status":"querying"}'
fi
`)
    chmodSync(fakeDreamina, 0o755)
    process.env.PATH = `${binDir}${delimiter}${originalPath ?? ''}`

    writeFileSync(join(pluginDir, 'plugin.json'), JSON.stringify({
      id: 'builtin.visual-dreamina',
      name: 'Dreamina',
      version: '1.0.0',
      apiVersion: '1',
      backend: {
        runtime: 'process',
        command: process.execPath,
        args: [dreaminaPlugin],
      },
      contributes: {
        visualProviders: [{
          id: 'dreamina',
          title: 'Dreamina',
          capabilities: ['text-to-video'],
        }],
      },
    }))

    manager = new PluginManager({ pluginDirs: [join(root, 'plugins')] })
    await manager.start()
    const visual = new PluginVisualService(manager, { requestTimeoutMs: 5_000 })
    const events: Array<{ type: string; submitId?: string }> = []
    const downloadDir = join(root, 'downloads')

    const submitted = await visual.invoke({
      modelId: 'dreamina',
      nodeKind: 'video',
      prompt: 'test prompt',
      downloadDir,
      assetUrlForPath: (filePath) => `/assets/${filePath.split('/').pop()}`,
      onEvent: (event) => events.push(event),
    })
    expect(submitted).toMatchObject({
      submitId: 'submit-1',
      taskStatus: 'querying',
    })
    expect(events).toContainEqual({ type: 'meta', submitId: 'submit-1' })

    const completed = await visual.query({
      providerId: 'dreamina',
      submitId: 'submit-1',
      nodeKind: 'video',
      downloadDir,
      assetUrlForPath: (filePath) => `/assets/${filePath.split('/').pop()}`,
    })
    expect(completed).toMatchObject({
      submitId: 'submit-1',
      taskStatus: 'success',
      url: '/assets/result.mp4',
      localPath: join(downloadDir, 'result.mp4'),
      fileName: 'result.mp4',
      mimeType: 'video/mp4',
    })
  })
})
