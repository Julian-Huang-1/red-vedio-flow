import { defineConfig } from 'tsup'

export default defineConfig({
  entry: {
    rvf: '../../packages/workflow-cli/src/index.ts',
  },
  format: ['esm'],
  platform: 'node',
  target: 'node20',
  outDir: 'dist/rvf',
  clean: true,
  splitting: false,
  noExternal: [/^@red-video-flow\//],
})
