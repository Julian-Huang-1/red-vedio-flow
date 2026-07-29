import { frontendExtensions } from './host'
import type { Disposable, FrontendFeatureActivator } from './types'

type FrontendFeatureModule = {
  activate: FrontendFeatureActivator
}

const featureModules = import.meta.glob<FrontendFeatureModule>('../features/**/activate.tsx')

let activationPromise: Promise<void> | undefined
const activeDisposables: Disposable[] = []

export function activateFrontendFeatures() {
  if (activationPromise) return activationPromise
  activationPromise = activateAllFeatures()
  return activationPromise
}

async function activateAllFeatures() {
  const loaders = Object.entries(featureModules).sort(([left], [right]) =>
    left.localeCompare(right),
  )
  const features = await Promise.all(loaders.map(async ([path, load]) => {
    try {
      return { path, feature: await load() }
    } catch (error) {
      console.error(`[red-video-flow] failed to load frontend feature ${path}`, error)
      return { path, feature: undefined }
    }
  }))

  for (const loaded of features) {
    if (!loaded.feature) continue
    try {
      const disposable = loaded.feature.activate(frontendExtensions.host)
      if (typeof disposable === 'function') {
        activeDisposables.push({ dispose: disposable })
      } else if (disposable) {
        activeDisposables.push(disposable)
      }
    } catch (error) {
      console.error(`[red-video-flow] failed to activate frontend feature ${loaded.path}`, error)
    }
  }
}

export function deactivateFrontendFeatures() {
  for (const disposable of activeDisposables.splice(0).reverse()) disposable.dispose()
  activationPromise = undefined
}

if (import.meta.hot) import.meta.hot.dispose(deactivateFrontendFeatures)
