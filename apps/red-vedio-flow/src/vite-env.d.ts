/// <reference types="vite/client" />

import type { useWorkflowStore } from '@/stores/workflowStore'

declare global {
  const __RED_VIDEO_FLOW_PUBLIC_BASE_URL__: string

  interface Window {
    /** 仅开发环境可用：工作流 Zustand store，用于控制台调试 */
    __workflowStore?: typeof useWorkflowStore
  }
}
