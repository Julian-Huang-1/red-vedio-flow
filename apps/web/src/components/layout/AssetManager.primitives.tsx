import type { ButtonHTMLAttributes, HTMLAttributes } from 'react'
import { dataBoolean } from '../../ui/dataAttributes'
import styles from './AssetManager.module.less'

export const AssetManagerPrimitive = {
  Entry(props: ButtonHTMLAttributes<HTMLButtonElement>) {
    return <button className={styles.entryButton} {...props} />
  },
  Root(props: HTMLAttributes<HTMLElement>) {
    return <aside className={styles.panel} role="dialog" aria-label="资产管理" {...props} />
  },
  Header(props: HTMLAttributes<HTMLElement>) {
    return <header className={styles.header} {...props} />
  },
  Tabs(props: HTMLAttributes<HTMLDivElement>) {
    return <div className={styles.tabs} {...props} />
  },
  Tab({
    active,
    ...props
  }: ButtonHTMLAttributes<HTMLButtonElement> & { active?: boolean }) {
    return <button data-active={dataBoolean(active)} {...props} />
  },
  Controls(props: HTMLAttributes<HTMLElement>) {
    return <section className={styles.controls} {...props} />
  },
  NodeList(props: HTMLAttributes<HTMLDivElement>) {
    return <div className={styles.nodeList} {...props} />
  },
  NodeRow(props: HTMLAttributes<HTMLDivElement>) {
    return <div className={styles.nodeRow} {...props} />
  },
  Footer(props: HTMLAttributes<HTMLElement>) {
    return <footer className={styles.footer} {...props} />
  },
}

