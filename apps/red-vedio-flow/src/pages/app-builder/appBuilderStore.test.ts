import { beforeEach, describe, expect, it } from 'vitest'
import { useAppBuilderStore } from './appBuilderStore'

describe('appBuilderStore', () => {
  beforeEach(() => {
    useAppBuilderStore.getState().reset()
  })

  it('commits a staged artifact only after the generation completes', () => {
    const store = useAppBuilderStore.getState()
    store.beginGeneration('session-1')
    store.stageArtifact({
      sessionId: 'session-1',
      title: '计数器',
      html: '<main>计数器</main>',
    })

    expect(useAppBuilderStore.getState().artifactsBySessionId['session-1']).toBeUndefined()

    useAppBuilderStore.getState().completeGeneration('session-1')
    const artifact = useAppBuilderStore.getState().artifactsBySessionId['session-1']
    expect(artifact).toMatchObject({
      sessionId: 'session-1',
      title: '计数器',
      version: 1,
    })
    expect(artifact.html).toContain('<!doctype html>')
    expect(useAppBuilderStore.getState().generatingSessionId).toBeUndefined()
  })

  it('keeps the previous version when the next generation is cancelled', () => {
    const store = useAppBuilderStore.getState()
    store.beginGeneration('session-1')
    store.stageArtifact({ sessionId: 'session-1', html: '<html>第一版</html>' })
    store.completeGeneration('session-1')

    const first = useAppBuilderStore.getState().artifactsBySessionId['session-1']
    useAppBuilderStore.getState().beginGeneration('session-1')
    useAppBuilderStore.getState().stageArtifact({
      sessionId: 'session-1',
      html: '<html>未完成版本</html>',
    })
    useAppBuilderStore.getState().cancelGeneration('session-1')

    expect(useAppBuilderStore.getState().artifactsBySessionId['session-1']).toEqual(first)
    expect(useAppBuilderStore.getState().pendingArtifactsBySessionId['session-1'])
      .toBeUndefined()
  })

  it('reports a completed run that did not publish HTML', () => {
    useAppBuilderStore.getState().beginGeneration('session-1')
    useAppBuilderStore.getState().completeGeneration('session-1')

    expect(useAppBuilderStore.getState().generationErrorsBySessionId['session-1'])
      .toBe('Agent 本轮没有生成可预览页面。')
  })
})
