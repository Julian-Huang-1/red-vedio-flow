import type { Disposable } from './types'

type Identified = {
  id: string
}

export class ContributionRegistry<T extends Identified> {
  private readonly contributions = new Map<string, T>()
  private readonly listeners = new Set<() => void>()
  private revision = 0

  register(contribution: T): Disposable {
    if (this.contributions.has(contribution.id)) {
      throw new Error(`Duplicate frontend contribution: ${contribution.id}`)
    }

    this.contributions.set(contribution.id, contribution)
    this.emit()

    return {
      dispose: () => {
        if (!this.contributions.delete(contribution.id)) return
        this.emit()
      },
    }
  }

  get(id: string) {
    return this.contributions.get(id)
  }

  list() {
    return [...this.contributions.values()]
  }

  subscribe = (listener: () => void) => {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  getSnapshot = () => this.revision

  private emit() {
    this.revision += 1
    for (const listener of this.listeners) listener()
  }
}
