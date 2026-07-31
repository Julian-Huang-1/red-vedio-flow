import { spawn } from 'node:child_process'

const PERMIT_URL =
  'https://edith.xiaohongshu.com/api/media/v1/upload/web/permit'
  + '?biz_name=fe&file_count=1&scene=platform&version=1'
const UPLOAD_ORIGIN = 'https://fe.devops.xiaohongshu.com'

type Permit = {
  token: string
  fileId: string
  uploadAddr: string
}

export class CoworkMediaUploader {
  constructor(
    private readonly request: typeof fetch = fetch,
  ) {}

  async upload(input: {
    bytes: Buffer
    fileName: string
    mimeType?: string
    cookie?: string
  }) {
    if (!isWebMedia(input.mimeType)) return undefined
    const authCookie = internalAccessCookie(input.cookie)
    if (!authCookie) {
      throw new Error('文件 CDN 上传需要有效的公司 SSO 登录态')
    }
    const commonHeaders = {
      Accept: 'application/json',
      Cookie: authCookie,
      Origin: UPLOAD_ORIGIN,
      Referer: `${UPLOAD_ORIGIN}/`,
    }
    let permitPayload: unknown
    try {
      const permitResponse = await this.request(PERMIT_URL, { headers: commonHeaders })
      permitPayload = await permitResponse.json().catch(() => undefined)
      if (!permitResponse.ok) {
        throw new Error(`获取文件上传许可失败：HTTP ${permitResponse.status}`)
      }
    } catch (error) {
      if (!isFetchNetworkError(error)) throw error
      permitPayload = JSON.parse(await curlRequest([
        '--fail-with-body',
        '-H', `Accept: ${commonHeaders.Accept}`,
        '-H', `Cookie: ${commonHeaders.Cookie}`,
        '-H', `Origin: ${commonHeaders.Origin}`,
        '-H', `Referer: ${commonHeaders.Referer}`,
        PERMIT_URL,
      ]))
    }
    const permit = parsePermit(permitPayload)
    const uploadUrl = validatedUploadUrl(permit.uploadAddr, permit.fileId)
    const uploadHeaders = {
      'Content-Type': input.mimeType ?? 'application/octet-stream',
      'Content-Length': String(input.bytes.length),
      'x-cos-security-token': permit.token,
      Origin: UPLOAD_ORIGIN,
      Referer: `${UPLOAD_ORIGIN}/`,
    }
    let staticUrl: string | undefined
    try {
      const uploadResponse = await this.request(uploadUrl, {
        method: 'PUT',
        headers: uploadHeaders,
        body: input.bytes,
      })
      if (!uploadResponse.ok) {
        throw new Error(`文件 CDN 上传失败：HTTP ${uploadResponse.status}`)
      }
      staticUrl = uploadResponse.headers.get('x-ros-static-url') ?? undefined
    } catch (error) {
      if (!isFetchNetworkError(error)) throw error
      const responseHeaders = await curlRequest([
        '--fail-with-body',
        '-X', 'PUT',
        '-D', '-',
        '-o', '/dev/null',
        ...Object.entries(uploadHeaders).flatMap(([name, value]) => ['-H', `${name}: ${value}`]),
        '--data-binary', '@-',
        uploadUrl,
      ], input.bytes)
      staticUrl = responseHeader(responseHeaders, 'x-ros-static-url')
    }
    staticUrl ||= `https://fe-platform.xhscdn.com/${permit.fileId}`
    if (!/^https:\/\//.test(staticUrl)) {
      throw new Error('文件 CDN 上传返回了无效 URL')
    }
    return staticUrl
  }
}

function isFetchNetworkError(error: unknown) {
  return error instanceof TypeError && error.message === 'fetch failed'
}

function curlRequest(args: string[], input?: Buffer) {
  return new Promise<string>((resolve, reject) => {
    const child = spawn('curl', ['-sS', '--max-time', '120', ...args], {
      stdio: ['pipe', 'pipe', 'pipe'],
    })
    const stdout: Buffer[] = []
    const stderr: Buffer[] = []
    child.stdout.on('data', (chunk: Buffer) => stdout.push(chunk))
    child.stderr.on('data', (chunk: Buffer) => stderr.push(chunk))
    child.on('error', reject)
    child.on('close', (code) => {
      if (code === 0) resolve(Buffer.concat(stdout).toString('utf8'))
      else reject(new Error(`curl 请求失败（${code}）：${Buffer.concat(stderr).toString('utf8').trim()}`))
    })
    child.stdin.end(input)
  })
}

function responseHeader(raw: string, name: string) {
  const prefix = `${name.toLowerCase()}:`
  return raw
    .split(/\r?\n/)
    .reverse()
    .find((line) => line.toLowerCase().startsWith(prefix))
    ?.slice(prefix.length)
    .trim()
}

export function internalAccessCookie(cookieHeader?: string) {
  if (!cookieHeader) return undefined
  for (const item of cookieHeader.split(';')) {
    const [rawName, ...valueParts] = item.trim().split('=')
    if (!/^common-internal-access-token-(prod|beta|sit)$/.test(rawName)) continue
    const value = valueParts.join('=').trim()
    if (value) return `${rawName}=${value}`
  }
  return undefined
}

function isWebMedia(mimeType?: string) {
  return Boolean(mimeType?.startsWith('video/') || mimeType?.startsWith('audio/'))
}

function parsePermit(payload: unknown): Permit {
  const item = (
    payload
    && typeof payload === 'object'
    && 'data' in payload
    && payload.data
    && typeof payload.data === 'object'
    && 'uploadTempPermits' in payload.data
    && Array.isArray(payload.data.uploadTempPermits)
  )
    ? payload.data.uploadTempPermits[0]
    : undefined
  if (!item || typeof item !== 'object') throw new Error('文件上传许可响应无效')
  const token = text(item, 'token')
  const fileId = Array.isArray(item.fileIds) ? String(item.fileIds[0] ?? '') : ''
  const uploadAddr = text(item, 'uploadAddr')
  if (!token || !fileId || !uploadAddr) throw new Error('文件上传许可缺少必要字段')
  return { token, fileId, uploadAddr }
}

function validatedUploadUrl(uploadAddr: string, fileId: string) {
  const url = new URL(
    uploadAddr.startsWith('http') ? uploadAddr : `https://${uploadAddr}`,
  )
  if (url.protocol !== 'https:') throw new Error('文件上传许可必须使用 HTTPS 地址')
  url.pathname = `${url.pathname.replace(/\/+$/, '')}/${encodeURIComponent(fileId)}`
  return url.toString()
}

function text(value: object, key: string) {
  const item = (value as Record<string, unknown>)[key]
  return typeof item === 'string' && item ? item : ''
}
