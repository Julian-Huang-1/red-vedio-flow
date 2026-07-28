import type { HTMLAttributes } from 'react'
import styles from './AgentDrawer.module.less'

export const AgentDrawerPrimitive = {
  Root(props: HTMLAttributes<HTMLElement>) {
    return (
      <aside
        className={styles.drawer}
        role="dialog"
        aria-label="Agent 助手"
        {...props}
      />
    )
  },
}

