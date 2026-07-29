import { describe, expect, it, vi } from 'vitest'
import { createFrontendExtensionHost } from './host'
import { ContributionRegistry } from './registry'

describe('frontend contribution registry', () => {
  it('registers, publishes and disposes a contribution', () => {
    const registry = new ContributionRegistry<{ id: string; value: number }>()
    const listener = vi.fn()
    registry.subscribe(listener)

    const registration = registry.register({ id: 'example', value: 42 })

    expect(registry.get('example')).toEqual({ id: 'example', value: 42 })
    expect(registry.list()).toEqual([{ id: 'example', value: 42 }])
    expect(listener).toHaveBeenCalledTimes(1)

    registration.dispose()
    registration.dispose()

    expect(registry.list()).toEqual([])
    expect(listener).toHaveBeenCalledTimes(2)
  })

  it('rejects duplicate contribution ids', () => {
    const registry = new ContributionRegistry<{ id: string }>()
    registry.register({ id: 'duplicate' })

    expect(() => registry.register({ id: 'duplicate' })).toThrow(
      'Duplicate frontend contribution: duplicate',
    )
  })
})

describe('frontend extension host', () => {
  it('keeps each extension point in its own registry', () => {
    const extensions = createFrontendExtensionHost()
    const Empty = () => null

    extensions.host.ui.contribute('canvas.overlay', 'overlay.test', Empty, { order: 20 })
    extensions.host.canvas.registerPanel({
      id: 'panel.test',
      title: 'Test panel',
      icon: Empty,
      component: Empty,
    })
    extensions.host.agent.registerMessageRenderer('text', 'message.test', Empty)
    extensions.host.commands.register('command.test', () => 'done')

    expect(extensions.registries.commands.list()).toHaveLength(1)
    expect(extensions.registries.ui.list()).toHaveLength(1)
    expect(extensions.registries.canvasPanels.list()).toHaveLength(1)
    expect(extensions.registries.messageRenderers.list()).toHaveLength(1)
    expect(extensions.registries.nodeTypes.list()).toHaveLength(0)
  })

  it('executes registered frontend commands', async () => {
    const extensions = createFrontendExtensionHost()
    extensions.host.commands.register(
      'math.double',
      (value: number) => value * 2,
    )

    await expect(extensions.host.commands.execute<number>('math.double', 21)).resolves.toBe(42)
    await expect(extensions.host.commands.execute('missing')).rejects.toThrow(
      'Frontend command not found: missing',
    )
  })
})
