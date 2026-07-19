import { defineConfig, devices } from '@playwright/test'

const nodeBin = `${process.env.HOME}/.nvm/versions/node/v22.22.1/bin`
const envPath = `${nodeBin}:${process.env.PATH ?? ''}`
const dataDir = '/tmp/red-video-flow-e2e-data'

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 30_000,
  expect: {
    timeout: 7_000,
  },
  use: {
    baseURL: 'http://127.0.0.1:5815',
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], channel: 'chrome' },
    },
  ],
  webServer: [
    {
      command: `rm -rf ${dataDir} && RED_VIDEO_FLOW_DATA_DIR=${dataDir} RED_VIDEO_FLOW_AGENT_PORT=5816 PATH=${envPath} pnpm --filter @red-video-flow/local-server exec tsx src/index.ts`,
      url: 'http://127.0.0.1:5816/api/health',
      reuseExistingServer: false,
      timeout: 20_000,
    },
    {
      command: `RED_VIDEO_FLOW_AGENT_ORIGIN=http://127.0.0.1:5816 PATH=${envPath} pnpm --filter @red-video-flow/web exec vite --host 127.0.0.1 --port 5815 --strictPort`,
      url: 'http://127.0.0.1:5815',
      reuseExistingServer: false,
      timeout: 20_000,
    },
  ],
})
