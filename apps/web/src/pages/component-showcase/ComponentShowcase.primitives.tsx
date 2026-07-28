import type { ButtonHTMLAttributes, HTMLAttributes } from 'react'
import { dataBoolean } from '../../ui/dataAttributes'
import styles from './ComponentShowcase.module.less'

export const ComponentShowcasePrimitive = {
  Root(props: HTMLAttributes<HTMLElement>) {
    return <main className={styles.page} {...props} />
  },
  Sidebar(props: HTMLAttributes<HTMLElement>) {
    return <aside className={styles.sidebar} {...props} />
  },
  Navigation(props: HTMLAttributes<HTMLElement>) {
    return <nav className={styles.navList} aria-label="组件列表" {...props} />
  },
  NavigationItem({
    active,
    ...props
  }: ButtonHTMLAttributes<HTMLButtonElement> & { active?: boolean }) {
    return <button data-active={dataBoolean(active)} {...props} />
  },
  Content(props: HTMLAttributes<HTMLElement>) {
    return <section className={styles.content} {...props} />
  },
  Panel(props: HTMLAttributes<HTMLElement>) {
    return <section className={styles.previewPanel} {...props} />
  },
}

