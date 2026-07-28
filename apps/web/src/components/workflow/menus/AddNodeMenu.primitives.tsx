import type { ButtonHTMLAttributes, HTMLAttributes } from 'react'
import { dataBoolean } from '../../../ui/dataAttributes'
import styles from './AddNodeMenu.module.less'

export const AddNodeMenuPrimitive = {
  Root(props: HTMLAttributes<HTMLDivElement>) {
    return <div className={styles.menu} role="menu" aria-label="添加节点" {...props} />
  },
  SectionTitle(props: HTMLAttributes<HTMLParagraphElement>) {
    return <p className={styles.sectionTitle} {...props} />
  },
  ItemList(props: HTMLAttributes<HTMLDivElement>) {
    return <div className={styles.itemList} {...props} />
  },
  Item({
    unavailable,
    ...props
  }: ButtonHTMLAttributes<HTMLButtonElement> & { unavailable?: boolean }) {
    return (
      <button
        className={styles.item}
        data-disabled={dataBoolean(unavailable || props.disabled)}
        {...props}
      />
    )
  },
}

