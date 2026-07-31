import { describe, expect, it, vi } from 'vitest'
import {
  CoworkMediaUploader,
  internalAccessCookie,
} from './mediaUploader.js'

describe('CoworkMediaUploader', () => {
  it('extracts only the internal access token cookie', () => {
    expect(internalAccessCookie(
      'other=value; common-internal-access-token-prod=token=value; session=secret',
    )).toBe('common-internal-access-token-prod=token=value')
    expect(internalAccessCookie('session=secret')).toBeUndefined()
  })

  it('uploads video through permit and returns the CDN URL', async () => {
    const request = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        data: {
          uploadTempPermits: [{
            token: 'temporary-token',
            fileIds: ['video-id'],
            uploadAddr: 'upload.xiaohongshu.com/media',
          }],
        },
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }))
      .mockResolvedValueOnce(new Response(undefined, {
        status: 200,
        headers: {
          'x-ros-static-url': 'https://sns-video.xhscdn.com/video-id.mp4',
        },
      }))
    const uploader = new CoworkMediaUploader(request)

    const url = await uploader.upload({
      bytes: Buffer.from('video-bytes'),
      fileName: 'source.mp4',
      mimeType: 'video/mp4',
      cookie: 'common-internal-access-token-prod=user-token',
    })

    expect(url).toBe('https://sns-video.xhscdn.com/video-id.mp4')
    expect(request).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining('/api/media/v1/upload/web/permit'),
      expect.objectContaining({
        headers: expect.objectContaining({
          Cookie: 'common-internal-access-token-prod=user-token',
        }),
      }),
    )
    expect(request).toHaveBeenNthCalledWith(
      2,
      'https://upload.xiaohongshu.com/media/video-id',
      expect.objectContaining({
        method: 'PUT',
        headers: expect.objectContaining({
          'Content-Type': 'video/mp4',
          'x-cos-security-token': 'temporary-token',
        }),
        body: Buffer.from('video-bytes'),
      }),
    )
  })

  it('keeps images in BlobStorage without a CDN upload', async () => {
    const request = vi.fn()
    const uploader = new CoworkMediaUploader(request)
    await expect(uploader.upload({
      bytes: Buffer.from('image'),
      fileName: 'image.jpg',
      mimeType: 'image/jpeg',
      cookie: 'common-internal-access-token-prod=user-token',
    })).resolves.toBeUndefined()
    expect(request).not.toHaveBeenCalled()
  })

  it('accepts HTTPS upload hosts returned by the trusted permit service', async () => {
    const request = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        data: {
          uploadTempPermits: [{
            token: 'temporary-token',
            fileIds: ['video-id'],
            uploadAddr: 'bucket.cos.ap-shanghai.myqcloud.com',
          }],
        },
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response(undefined, { status: 204 }))
    const uploader = new CoworkMediaUploader(request)

    await uploader.upload({
      bytes: Buffer.from('video'),
      fileName: 'video.mp4',
      mimeType: 'video/mp4',
      cookie: 'common-internal-access-token-prod=user-token',
    })

    expect(request).toHaveBeenNthCalledWith(
      2,
      'https://bucket.cos.ap-shanghai.myqcloud.com/video-id',
      expect.objectContaining({ method: 'PUT' }),
    )
  })
})
