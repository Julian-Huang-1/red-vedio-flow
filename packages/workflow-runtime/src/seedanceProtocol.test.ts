import { describe, expect, it } from 'vitest'
import type { NodeRunInput } from '@red-video-flow/workflow-core'
import {
  buildSeedanceCreateTaskRequest,
  seedanceMedia,
  seedanceTaskId,
  seedanceTaskStatus,
} from './seedanceProtocol.js'

describe('Seedance protocol', () => {
  it('uses the external provider and model names required by MaaS', () => {
    const input: NodeRunInput = {
      prompt: '生成小孩跑步的视频',
      attachments: [],
      upstreamResults: [],
      model: {
        providerId: 'builtin.visual-seedance',
        modelId: 'doubao-seedance-2',
      },
      generationConfig: {
        type: 'volc-video',
        version: 1,
        providerOptions: {
          ratio: 'adaptive',
          duration: 5,
          resolution: '720p',
          generate_audio: true,
          camera_fixed: false,
          watermark: false,
          seed: -1,
        },
      },
    }
    expect(buildSeedanceCreateTaskRequest(input)).toEqual({
      provider: 'doubao-seedance2.0',
      model: 'Doubao-seedance2.0',
      content: [{ type: 'text', text: '生成小孩跑步的视频' }],
      ratio: 'adaptive',
      duration: 5,
      resolution: '720p',
      generate_audio: true,
      camera_fixed: false,
      watermark: false,
      seed: -1,
    })
  })

  it('maps mixed image, video, and audio inputs to Seedance content', () => {
    const input: NodeRunInput = {
      prompt: '使用视频动作、参考人物图片并保留背景音乐',
      attachments: [{
        id: 'audio-1',
        kind: 'file',
        url: '/api/blobs/audio-1',
        mimeType: 'audio/mpeg',
      }],
      upstreamResults: [{
        edgeId: 'edge-video',
        nodeId: 'video-node',
        resultId: 'video-result',
        resultType: 'video',
        assets: [{
          id: 'video-1',
          kind: 'video',
          url: '/api/blobs/video-1',
          mimeType: 'video/mp4',
        }],
      }, {
        edgeId: 'edge-image',
        nodeId: 'image-node',
        resultId: 'image-result',
        resultType: 'image',
        assets: [{
          id: 'image-1',
          kind: 'image',
          url: '/api/blobs/image-1',
          mimeType: 'image/jpeg',
        }],
      }],
      model: {
        providerId: 'builtin.visual-seedance',
        modelId: 'doubao-seedance-2',
      },
      generationConfig: {
        type: 'volc-video',
        version: 1,
      },
    }

    expect(buildSeedanceCreateTaskRequest(input).content).toEqual([
      {
        type: 'text',
        text: '使用视频动作、参考人物图片并保留背景音乐',
      },
      {
        type: 'audio_url',
        audio_url: { url: '/api/blobs/audio-1' },
        role: 'reference_audio',
      },
      {
        type: 'video_url',
        video_url: { url: '/api/blobs/video-1' },
        role: 'reference_video',
      },
      {
        type: 'image_url',
        image_url: { url: '/api/blobs/image-1' },
        role: 'reference_image',
      },
    ])
  })

  it('preserves the provider-qualified task ID required by MaaS polling', () => {
    expect(seedanceTaskId({ response: { task_id: 'task-1' } })).toBe('task-1')
    expect(seedanceTaskId({ response: { id: 'Doubao-seedance2.0:cgt-123' } }))
      .toBe('Doubao-seedance2.0:cgt-123')
    expect(seedanceTaskId({ id: 'Doubao-seedance2.0:cgt-123' }))
      .toBe('Doubao-seedance2.0:cgt-123')
  })

  it('treats every response containing a task ID as running', () => {
    expect(seedanceTaskStatus({
      response: { id: 'Doubao-seedance2.0:cgt-123' },
    })).toBe('running')
    expect(seedanceTaskStatus({
      response: { id: 'cgt-123', status: 'running' },
    })).toBe('running')
    expect(seedanceTaskStatus({
      response: { id: 'cgt-123', status: 'error' },
    })).toBe('running')
  })

  it('reads wrapped task status and media responses', () => {
    expect(seedanceTaskStatus({ response: { status: 'completed' } })).toBe('succeeded')
    expect(seedanceMedia({
      response: {
        result: {
          video_url: 'https://assets.test/result.mp4',
          last_frame_url: 'https://assets.test/last.png',
        },
      },
    })).toEqual({
      videoUrl: 'https://assets.test/result.mp4',
      lastFrameUrl: 'https://assets.test/last.png',
    })
  })
})
