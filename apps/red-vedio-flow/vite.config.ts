import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { TanStackRouterVite } from '@tanstack/router-plugin/vite'
import { resolve } from 'node:path'

const localServerOrigin =
  process.env.RED_VIDEO_FLOW_AGENT_ORIGIN
  ?? `http://127.0.0.1:${process.env.RED_VEDIO_FLOW_AGENT_PORT ?? process.env.RED_VIDEO_FLOW_AGENT_PORT ?? 5176}`
const coworkDeploymentUrl = process.env.RED_VIDEO_FLOW_COWORK_DEPLOYMENT_URL?.trim()
const coworkDeployment = coworkDeploymentUrl ? new URL(coworkDeploymentUrl) : undefined
const proxyTarget = coworkDeployment?.origin ?? localServerOrigin
const deploymentPath = coworkDeployment?.pathname.replace(/\/+$/, '') ?? ''

export default defineConfig({
  plugins: [TanStackRouterVite({ target: 'react', autoCodeSplitting: true }), react()],
  resolve: {
    alias: {
      '@': resolve(__dirname, './src'),
      '@red-video-flow/workflow-core': resolve(__dirname, '../../packages/workflow-core/src/index.ts'),
      '@red-video-flow/workflow-client': resolve(__dirname, '../../packages/workflow-client/src/index.ts'),
      '@red-video-flow/workflow-runtime': resolve(__dirname, '../../packages/workflow-runtime/src/index.ts'),
    },
  },
  server: {
    allowedHosts: ['local.xiaohongshu.com'],
    fs: {
      allow: [resolve(__dirname, '../..')],
    },
    proxy: {
      '/api': {
        target: proxyTarget,
        changeOrigin: true,
        secure: true,
        rewrite: deploymentPath
          ? (path) => `${deploymentPath}${path}`
          : undefined,
        configure: coworkDeployment
          ? (proxy) => {
              proxy.on('proxyRes', (proxyRes, req) => {
                if ((proxyRes.statusCode ?? 0) >= 300) {
                  console.warn(
                    `[cowork proxy] ${req.method} ${req.url} -> ${proxyRes.statusCode}`
                    + `${proxyRes.headers.location ? ` ${proxyRes.headers.location}` : ''}`,
                  )
                }
              })
              proxy.on('error', (error, req) => {
                console.error(
                  `[cowork proxy] ${req.method} ${req.url}: ${error.message}`,
                )
              })
            }
          : undefined,
      },
    },
  },
})
