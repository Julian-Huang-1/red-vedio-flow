/// <reference types="vite/client" />

import type { useWorkflowStore } from '@/stores/workflowStore'

declare global {
  interface Window {
    /** 仅开发环境可用：工作流 Zustand store，用于控制台调试 */
    __workflowStore?: typeof useWorkflowStore
  }
}
