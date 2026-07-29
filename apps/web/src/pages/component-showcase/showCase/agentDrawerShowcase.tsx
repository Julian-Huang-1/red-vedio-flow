import { useEffect } from 'react'
import { AgentDrawer } from '../../../components/layout/AgentDrawer'
import { useCanvasUiStore } from '../../../state/canvasUiStore'
import styles from '../ComponentShowcase.module.less'
import type { ShowcaseItem } from './types'

function AgentDrawerPreview() {
  useEffect(() => {
    const canvasUi = useCanvasUiStore.getState()
    const wasOpen = canvasUi.openWorkspacePanels.includes('agent')
    if (!wasOpen) canvasUi.toggleWorkspacePanel('agent')

    return () => {
      if (!wasOpen) useCanvasUiStore.getState().closeWorkspacePanel('agent')
    }
  }, [])

  return (
    <div className={styles.agentDrawerPreview}>
      <AgentDrawer />
    </div>
  )
}

export const agentDrawerShowcase: ShowcaseItem = {
  id: 'agent-drawer',
  title: 'AgentDrawer',
  category: 'agent',
  description: '画布右侧的 Agent 对话抽屉，包含会话、消息、上下文和输入区域。',
  preview: () => <AgentDrawerPreview />,
}
