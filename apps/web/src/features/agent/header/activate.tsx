import { AgentDrawerHeader } from '../../../components/layout/AgentDrawerHeader'
import type { AgentDrawerController } from '../../../components/layout/AgentDrawer.logic'
import type { FrontendFeatureActivator } from '../../../extension-system/types'
import { AgentHistoryPanel } from '../../../components/layout/AgentHistoryPanel'

function AgentDrawerHeaderContribution({ drawer }: { drawer: AgentDrawerController }) {
  const activeTitle = drawer.sessions.find((session) => session.id === drawer.sessionId)?.title ?? '新对话'
  return (
    <>
      <AgentDrawerHeader
        title={activeTitle}
        historyOpen={drawer.isHistoryOpen}
        onNew={drawer.createSession}
        onToggleHistory={drawer.toggleHistory}
        onClose={drawer.close}
      />
      {drawer.isHistoryOpen ? (
        <AgentHistoryPanel
          sessions={drawer.sessions}
          activeId={drawer.sessionId}
          query={drawer.historyQuery}
          error={drawer.historyError}
          onQueryChange={drawer.setHistoryQuery}
          onSelect={drawer.openSession}
          onCreate={drawer.createSession}
          onRename={drawer.renameSession}
          onDelete={drawer.removeSession}
        />
      ) : null}
    </>
  )
}

export const activate: FrontendFeatureActivator = (app) =>
  app.ui.contribute(
    'agent.drawer.header',
    'agent.drawer.header.default',
    AgentDrawerHeaderContribution,
  )
