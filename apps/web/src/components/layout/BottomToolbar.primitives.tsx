import type { ButtonHTMLAttributes, HTMLAttributes } from 'react'
import { dataBoolean } from '../../ui/dataAttributes'
import styles from './BottomToolbar.module.less'

export const BottomToolbarPrimitive = {
  Root(props: HTMLAttributes<HTMLElement>) {
    return <nav className={styles.toolbar} aria-label="工作流工具栏" {...props} />
  },
  PrimaryAction(props: ButtonHTMLAttributes<HTMLButtonElement>) {
    return <button className={styles.primaryButton} {...props} />
  },
  Group(props: HTMLAttributes<HTMLDivElement>) {
    return <div className={styles.toolGroup} {...props} />
  },
  Tool({
    active,
    ...props
  }: ButtonHTMLAttributes<HTMLButtonElement> & { active?: boolean }) {
    return <button className={styles.toolButton} data-active={dataBoolean(active)} {...props} />
  },
}

