import type { ButtonHTMLAttributes, HTMLAttributes } from 'react'
import styles from './CanvasToolRail.module.less'

export const CanvasToolRailPrimitive = {
  Root(props: HTMLAttributes<HTMLElement>) {
    return <aside className={styles.panel} {...props} />
  },
  Header(props: HTMLAttributes<HTMLDivElement>) {
    return <div className={styles.panelHeader} {...props} />
  },
  Close(props: ButtonHTMLAttributes<HTMLButtonElement>) {
    return <button aria-label="关闭" title="关闭" {...props} />
  },
}
