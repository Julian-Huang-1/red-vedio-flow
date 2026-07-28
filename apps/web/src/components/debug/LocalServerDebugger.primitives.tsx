import type { ButtonHTMLAttributes, DetailsHTMLAttributes, HTMLAttributes } from 'react'
import { dataBoolean } from '../../ui/dataAttributes'
import styles from './LocalServerDebugger.module.less'

export const LocalServerDebuggerPrimitive = {
  Root(props: HTMLAttributes<HTMLDivElement>) {
    return <div className={styles.root} {...props} />
  },
  Panel(props: HTMLAttributes<HTMLElement>) {
    return <section className={styles.panel} role="dialog" aria-label="Local Server 调试器" {...props} />
  },
  Filter({
    active,
    ...props
  }: ButtonHTMLAttributes<HTMLButtonElement> & { active?: boolean }) {
    return <button type="button" className={styles.filter} data-active={dataBoolean(active)} {...props} />
  },
  Event({
    error,
    ...props
  }: DetailsHTMLAttributes<HTMLDetailsElement> & { error?: boolean }) {
    return <details className={styles.eventRow} data-error={dataBoolean(error)} {...props} />
  },
  Trigger({
    error,
    ...props
  }: ButtonHTMLAttributes<HTMLButtonElement> & { error?: boolean }) {
    return <button type="button" className={styles.trigger} data-error={dataBoolean(error)} {...props} />
  },
}

