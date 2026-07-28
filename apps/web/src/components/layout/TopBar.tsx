import { Bot, Check, ChevronDown, GitBranch, LoaderCircle, PanelsTopLeft, Plus, Trash2 } from 'lucide-react'
import { useTopBar } from './TopBar.logic'
import { TopBarPrimitive as TopBarUi } from './TopBar.primitives'
import styles from './TopBar.module.less'

export function TopBar() {
  const topBar = useTopBar()

  return (
    <TopBarUi.Root data-state={topBar.isBusy ? 'busy' : 'ready'}>
      {topBar.isAssetManagerOpen ? (
        <TopBarUi.Spacer />
      ) : (
        <TopBarUi.FloatingBar>
          <TopBarUi.LogoButton title="回到首页" onClick={topBar.goHome}>
            <TopBarUi.LogoMark />
          </TopBarUi.LogoButton>
          <TopBarUi.WorkspaceButton title={topBar.displayTitle}>
            <span>{topBar.displayTitle}</span>
          </TopBarUi.WorkspaceButton>
          <TopBarUi.Divider />
          <TopBarUi.CanvasSwitcher containerRef={topBar.canvasMenuRef}>
            <TopBarUi.CanvasButton
              active={topBar.isCanvasMenuOpen}
              aria-label="切换画布"
              title="切换画布"
              onClick={topBar.toggleCanvasMenu}
            >
              <span>画布 {topBar.currentCanvasIndex}</span>
              <ChevronDown size={13} />
            </TopBarUi.CanvasButton>
            {topBar.isCanvasMenuOpen ? (
              <TopBarUi.CanvasMenu>
                <TopBarUi.CanvasMenuHeader>画布</TopBarUi.CanvasMenuHeader>
                <TopBarUi.CanvasMenuList>
                  {topBar.sortedWorkflows.map((workflow, index) => {
                    const isActive = workflow.id === topBar.workflowId
                    return (
                      <TopBarUi.CanvasMenuItem key={workflow.id} active={isActive}>
                        <button
                          data-disabled={topBar.isBusy || undefined}
                          disabled={topBar.isBusy}
                          onClick={() => topBar.switchCanvas(workflow.id)}
                        >
                          <span>
                            <strong>画布 {index + 1}</strong>
                            <small>{workflow.title === '默认工作流' ? '未命名工作区' : workflow.title}</small>
                          </span>
                          {isActive ? <Check size={16} /> : null}
                        </button>
                        <TopBarUi.DeleteCanvasButton
                          title={`删除画布 ${index + 1}`}
                          disabled={topBar.isBusy}
                          onClick={(event) => {
                            event.stopPropagation()
                            topBar.deleteCanvas(workflow.id, `画布 ${index + 1}`)
                          }}
                        >
                          <Trash2 size={15} />
                        </TopBarUi.DeleteCanvasButton>
                      </TopBarUi.CanvasMenuItem>
                    )
                  })}
                  {topBar.sortedWorkflows.length === 0 ? (
                    <TopBarUi.CanvasMenuEmpty>暂无画布</TopBarUi.CanvasMenuEmpty>
                  ) : null}
                </TopBarUi.CanvasMenuList>
                <TopBarUi.CreateCanvasButton
                  busy={topBar.isBusy}
                  disabled={topBar.isBusy}
                  onClick={topBar.createCanvas}
                >
                  {topBar.isBusy ? <LoaderCircle size={16} className={styles.spinIcon} /> : <Plus size={16} />}
                  新建画布
                </TopBarUi.CreateCanvasButton>
              </TopBarUi.CanvasMenu>
            ) : null}
          </TopBarUi.CanvasSwitcher>
        </TopBarUi.FloatingBar>
      )}

      <TopBarUi.ModeSwitch>
        <TopBarUi.Mode active>
          <GitBranch size={15} />
          工作流
        </TopBarUi.Mode>
        <TopBarUi.Mode>
          <PanelsTopLeft size={15} />
          故事板
        </TopBarUi.Mode>
      </TopBarUi.ModeSwitch>

      <TopBarUi.AgentSlot>
        <TopBarUi.AgentButton
          active={topBar.isAgentOpen}
          aria-label="打开 Agent"
          title="打开 Agent"
          onClick={topBar.toggleAgent}
        >
          <Bot size={17} />
          Agent
        </TopBarUi.AgentButton>
        {topBar.availableAgentCount > 0 ? (
          <TopBarUi.AgentCount>{topBar.availableAgentCount}</TopBarUi.AgentCount>
        ) : null}
      </TopBarUi.AgentSlot>
    </TopBarUi.Root>
  )
}
