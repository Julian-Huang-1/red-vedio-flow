import { Bot, GitBranch } from 'lucide-react'
import { useEffect } from 'react'
import { useWorkflowStore } from '../../store/workflowStore'
import styles from './TopBar.module.less'

export function TopBar() {
  const agents = useWorkflowStore((state) => state.agents)
  const selectedAgentId = useWorkflowStore((state) => state.selectedAgentId)
  const agentStatus = useWorkflowStore((state) => state.agentStatus)
  const loadAgents = useWorkflowStore((state) => state.loadAgents)
  const selectAgent = useWorkflowStore((state) => state.selectAgent)
  const availableAgents = agents.filter((agent) => agent.invokable)

  useEffect(() => {
    void loadAgents()
  }, [loadAgents])

  return (
    <header className="pointer-events-none absolute inset-x-0 top-0 z-20 flex items-start justify-between p-4">
      <div className={`${styles.floatingBar} pointer-events-auto`}>
        <div className={styles.logoMark} />
        <span className="text-sm text-zinc-100">red-vedio-flow</span>
      </div>

      <div className={`${styles.segmented} pointer-events-auto`}>
        <div className={styles.segmentActive}>
          <GitBranch size={15} />
          工作流
        </div>
      </div>

      <div className="pointer-events-auto flex items-center gap-2">
        <label className={styles.agentPicker}>
          <Bot size={16} />
          <select
            value={selectedAgentId ?? ''}
            onChange={(event) => selectAgent(event.target.value)}
            disabled={agentStatus === 'loading' || availableAgents.length === 0}
            title={availableAgents.length ? '选择本地 Agent' : '未检测到可调用 Agent'}
          >
            {availableAgents.length === 0 ? (
              <option value="">{agentStatus === 'loading' ? '扫描中' : 'Agent'}</option>
            ) : (
              availableAgents.map((agent) => (
                <option key={agent.id} value={agent.id}>
                  {agent.label}
                </option>
              ))
            )}
          </select>
        </label>
      </div>
    </header>
  )
}
