import { Copy, LoaderCircle } from 'lucide-react'
import type { LocalAgent } from '@red-video-flow/workflow-core'
import styles from './AgentDrawer.module.less'

type Props = {
  agents: LocalAgent[]
  isCopying: boolean
  copiedAgentId?: string
  error?: string
  onCopy: (agentId: string) => void
}

export function AgentRegistrationPrompt({
  agents,
  isCopying,
  copiedAgentId,
  error,
  onCopy,
}: Props) {
  const unavailableAgents = agents.filter((agent) => !agent.available)
  if (unavailableAgents.length === 0) return null

  return (
    <section className={styles.registrationBlock}>
      <div>
        <strong>注册本机 Agent CLI</strong>
        <p>复制提示词发给对应 Agent，由它注册自己的可执行路径。</p>
      </div>
      <div className={styles.registrationActions}>
        {unavailableAgents.map((agent) => (
          <button
            key={agent.id}
            type="button"
            disabled={isCopying}
            onClick={() => onCopy(agent.id)}
          >
            {isCopying ? <LoaderCircle className={styles.statusSpinner} size={14} /> : <Copy size={14} />}
            {copiedAgentId === agent.id ? '已复制' : `复制 ${agent.label} 提示词`}
          </button>
        ))}
      </div>
      {error ? <p className={styles.registrationError}>{error}</p> : null}
    </section>
  )
}
