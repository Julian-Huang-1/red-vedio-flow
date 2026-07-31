import type { Provider, ProviderRegistry as ProviderRegistryContract } from '@red-video-flow/workflow-core'

export class ProviderRegistry implements ProviderRegistryContract {
  private readonly providers = new Map<string, Provider>()
  private readonly modalities = new Map<Provider['modality'], Provider>()

  register(provider: Provider) {
    if (this.providers.has(provider.id)) throw new Error(`provider already registered: ${provider.id}`)
    this.providers.set(provider.id, provider)
    this.modalities.set(provider.modality, provider)
  }

  get(providerId: string) {
    const provider = this.providers.get(providerId)
    if (!provider) throw new Error(`provider not found: ${providerId}`)
    return provider
  }

  resolve(providerId: string, modality: Provider['modality']) {
    const provider = this.providers.get(providerId) ?? this.modalities.get(modality)
    if (!provider) throw new Error(`provider not found: ${providerId}`)
    return provider
  }

  list() {
    return [...this.providers.values()].map(({ id, modality }) => ({ id, modality }))
  }
}
