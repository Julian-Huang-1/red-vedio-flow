import { chmodSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { delimiter, join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { normalizeVisualTaskStatus, VisualService } from './service'

const originalPath = process.env.PATH
let tempDir: string | undefined

afterEach(() => {
  process.env.PATH = originalPath
  if (tempDir) rmSync(tempDir, { recursive: true, force: true })
  tempDir = undefined
})

function installFakeDreamina(output: object, mediaFile?: string) {
  tempDir = mkdtempSync(join(tmpdir(), 'red-video-flow-visual-test-'))
  const binPath = join(tempDir, 'dreamina')
  const mediaScript = mediaFile
    ? `
mkdir -p "$download_dir"
printf 'fake-media' > "$download_dir/${mediaFile}"
`
    : ''
  writeFileSync(
    binPath,
    `#!/bin/sh
download_dir=""
for arg in "$@"; do
  case "$arg" in
    --download_dir=*) download_dir="\${arg#--download_dir=}" ;;
  esac
done
${mediaScript}
printf '%s\\n' '${JSON.stringify(output)}'
`,
  )
  chmodSync(binPath, 0o755)
  process.env.PATH = `${tempDir}${delimiter}${originalPath ?? ''}`
  return tempDir
}

describe('VisualService query', () => {
  it('normalizes known provider states', () => {
    expect(normalizeVisualTaskStatus('querying')).toBe('querying')
    expect(normalizeVisualTaskStatus('success')).toBe('success')
    expect(normalizeVisualTaskStatus('failed')).toBe('failed')
    expect(normalizeVisualTaskStatus(undefined, true)).toBe('success')
  })

  it('continues a task by submitId and exposes downloaded media', async () => {
    const root = installFakeDreamina(
      {
        submit_id: 'submit-1',
        gen_status: 'success',
        result_json: { videos: [{ video_url: 'https://example.com/result.mp4' }] },
      },
      'result.mp4',
    )
    const downloadDir = join(root, 'downloads')

    const result = await new VisualService().query({
      submitId: 'submit-1',
      nodeKind: 'video',
      downloadDir,
      assetUrlForPath: (filePath) => `/assets/${filePath.split('/').pop()}`,
    })

    expect(result).toMatchObject({
      submitId: 'submit-1',
      taskStatus: 'success',
      genStatus: 'success',
      url: '/assets/result.mp4',
      localPath: join(downloadDir, 'result.mp4'),
      fileName: 'result.mp4',
      mimeType: 'video/mp4',
    })
  })

  it('keeps querying tasks non-terminal without inventing a media URL', async () => {
    const root = installFakeDreamina({
      submit_id: 'submit-2',
      gen_status: 'querying',
    })

    const result = await new VisualService().query({
      submitId: 'submit-2',
      nodeKind: 'image',
      downloadDir: join(root, 'downloads'),
      assetUrlForPath: () => '/unused',
    })

    expect(result).toMatchObject({
      submitId: 'submit-2',
      taskStatus: 'querying',
      genStatus: 'querying',
    })
    expect(result.url).toBeUndefined()
  })
})
