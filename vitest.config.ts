import { defineConfig } from 'vitest/config'
import { fileURLToPath, URL } from 'node:url'

export default defineConfig({
  resolve: {
    alias: {
      '@red-video-flow/local-backend': fileURLToPath(new URL('./packages/local-backend/src/index.ts', import.meta.url)),
      '@red-video-flow/plugin-contract': fileURLToPath(new URL('./packages/plugin-contract/src/index.ts', import.meta.url)),
      '@red-video-flow/plugin-sdk': fileURLToPath(new URL('./packages/plugin-sdk/src/index.ts', import.meta.url)),
      '@red-video-flow/workflow-client': fileURLToPath(new URL('./packages/workflow-client/src/index.ts', import.meta.url)),
      '@red-video-flow/workflow-core': fileURLToPath(new URL('./packages/workflow-core/src/index.ts', import.meta.url)),
      '@red-video-flow/workflow-runtime': fileURLToPath(new URL('./packages/workflow-runtime/src/index.ts', import.meta.url)),
    },
  },
  test: {
    include: ['apps/**/*.{test,spec}.{ts,tsx}', 'packages/**/*.{test,spec}.{ts,tsx}'],
    exclude: ['tests/e2e/**', '**/node_modules/**', '**/dist/**'],
  },
})
