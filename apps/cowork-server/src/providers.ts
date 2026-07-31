import { NetworkBoundaryProvider } from '@red-video-flow/workflow-runtime/network-provider'
import type { CoworkConfig } from './config.js'
import { ProviderRegistry } from './providerRegistry.js'

export {
  ProviderBoundaryError,
  buildProviderRequest,
  unwrapProviderPayload,
} from '@red-video-flow/workflow-runtime/network-provider'

export function createProviderRegistry(config: CoworkConfig) {
  const registry = new ProviderRegistry()
  registry.register(new NetworkBoundaryProvider(
    'cowork.text',
    'text',
    config.textProviderUrl,
  ))
  registry.register(new NetworkBoundaryProvider(
    'cowork.image',
    'image',
    config.imageProviderUrl,
  ))
  registry.register(new NetworkBoundaryProvider(
    'cowork.video',
    'video',
    config.videoProviderUrl,
  ))
  return registry
}
