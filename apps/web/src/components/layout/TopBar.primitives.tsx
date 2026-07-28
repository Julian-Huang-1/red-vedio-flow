import type { ButtonHTMLAttributes, HTMLAttributes, RefObject } from 'react'
import { dataBoolean } from '../../ui/dataAttributes'
import styles from './TopBar.module.less'

export const TopBarPrimitive = {
  Root(props: HTMLAttributes<HTMLElement>) {
    return (
      <header
        className="pointer-events-none absolute inset-x-0 top-0 z-20 flex items-start justify-between p-4"
        {...props}
      />
    )
  },
  Spacer(props: HTMLAttributes<HTMLDivElement>) {
    return <div className={styles.topSpacer} {...props} />
  },
  FloatingBar(props: HTMLAttributes<HTMLDivElement>) {
    return <div className={`${styles.floatingBar} pointer-events-auto`} {...props} />
  },
  LogoButton(props: ButtonHTMLAttributes<HTMLButtonElement>) {
    return <button className={styles.logoButton} {...props} />
  },
  LogoMark(props: HTMLAttributes<HTMLSpanElement>) {
    return <span className={styles.logoMark} {...props} />
  },
  WorkspaceButton(props: ButtonHTMLAttributes<HTMLButtonElement>) {
    return <button className={styles.workspaceButton} {...props} />
  },
  Divider(props: HTMLAttributes<HTMLSpanElement>) {
    return <span className={styles.divider} {...props} />
  },
  CanvasSwitcher({
    containerRef,
    ...props
  }: HTMLAttributes<HTMLDivElement> & { containerRef: RefObject<HTMLDivElement> }) {
    return <div ref={containerRef} className={styles.canvasSwitcher} {...props} />
  },
  CanvasButton({
    active,
    ...props
  }: ButtonHTMLAttributes<HTMLButtonElement> & { active?: boolean }) {
    return (
      <button
        className={styles.canvasButton}
        data-active={dataBoolean(active)}
        aria-expanded={active}
        {...props}
      />
    )
  },
  CanvasMenu(props: HTMLAttributes<HTMLDivElement>) {
    return <div className={styles.canvasMenu} role="menu" aria-label="切换画布" {...props} />
  },
  CanvasMenuHeader(props: HTMLAttributes<HTMLDivElement>) {
    return <div className={styles.canvasMenuHeader} {...props} />
  },
  CanvasMenuList(props: HTMLAttributes<HTMLDivElement>) {
    return <div className={styles.canvasMenuList} {...props} />
  },
  CanvasMenuItem({
    active,
    ...props
  }: HTMLAttributes<HTMLDivElement> & { active?: boolean }) {
    return <div className={styles.canvasMenuItem} data-active={dataBoolean(active)} {...props} />
  },
  DeleteCanvasButton(props: ButtonHTMLAttributes<HTMLButtonElement>) {
    return (
      <button
        className={styles.deleteCanvasButton}
        data-disabled={dataBoolean(props.disabled)}
        {...props}
      />
    )
  },
  CanvasMenuEmpty(props: HTMLAttributes<HTMLDivElement>) {
    return <div className={styles.canvasMenuEmpty} {...props} />
  },
  CreateCanvasButton({
    busy,
    ...props
  }: ButtonHTMLAttributes<HTMLButtonElement> & { busy?: boolean }) {
    return (
      <button
        className={styles.createCanvasButton}
        data-disabled={dataBoolean(props.disabled)}
        data-state={busy ? 'busy' : 'idle'}
        {...props}
      />
    )
  },
  ModeSwitch(props: HTMLAttributes<HTMLDivElement>) {
    return <div className={`${styles.segmented} pointer-events-auto`} {...props} />
  },
  Mode({
    active,
    ...props
  }: ButtonHTMLAttributes<HTMLButtonElement> & { active?: boolean }) {
    return <button className={styles.segmentButton} data-active={dataBoolean(active)} {...props} />
  },
  AgentSlot(props: HTMLAttributes<HTMLDivElement>) {
    return <div className="pointer-events-auto flex items-center gap-2" {...props} />
  },
  AgentButton({
    active,
    ...props
  }: ButtonHTMLAttributes<HTMLButtonElement> & { active?: boolean }) {
    return <button className={styles.agentButton} data-active={dataBoolean(active)} {...props} />
  },
  AgentCount(props: HTMLAttributes<HTMLSpanElement>) {
    return <span className={styles.agentCount} {...props} />
  },
}
