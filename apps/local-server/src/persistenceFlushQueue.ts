export class PersistenceFlushQueue {
  private pending = new Set<Promise<void>>()
  private error: unknown

  add(operation: Promise<void>) {
    this.pending.add(operation)
    void operation
      .catch((error) => {
        this.error ??= error
      })
      .finally(() => this.pending.delete(operation))
  }

  async flush() {
    while (this.pending.size) await Promise.allSettled([...this.pending])
    if (this.error) {
      const error = this.error
      this.error = undefined
      throw error
    }
  }
}
