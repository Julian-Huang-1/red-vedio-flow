import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'node:path'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@red-video-flow/workflow-core': resolve(__dirname, '../../packages/workflow-core/src/index.ts'),
      '@red-video-flow/workflow-client': resolve(__dirname, '../../packages/workflow-client/src/index.ts'),
      '@red-video-flow/workflow-runtime': resolve(__dirname, '../../packages/workflow-runtime/src/index.ts'),
    },
  },
  server: {
    fs: {
      allow: [resolve(__dirname, '../..')],
    },
    proxy: {
      '/api': 'http://127.0.0.1:5176',
    },
  },
})
