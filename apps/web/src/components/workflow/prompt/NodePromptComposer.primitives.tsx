import type {
  ButtonHTMLAttributes,
  HTMLAttributes,
  RefObject,
  TextareaHTMLAttributes,
} from 'react'
import { dataBoolean } from '../../../ui/dataAttributes'
import styles from './NodePromptComposer.module.less'

export const NodePromptComposerPrimitive = {
  Root(props: HTMLAttributes<HTMLDivElement>) {
    return <div className={`${styles.composer} nodrag nopan`} data-node-composer="true" {...props} />
  },
  Close(props: ButtonHTMLAttributes<HTMLButtonElement>) {
    return <button className={styles.closeButton} title="关闭" {...props} />
  },
  Materials(props: HTMLAttributes<HTMLDivElement>) {
    return <div className={styles.inputMaterials} aria-label="输入连接的物料" {...props} />
  },
  Material(props: HTMLAttributes<HTMLDivElement>) {
    return <div className={styles.materialBadge} {...props} />
  },
  Input({
    inputRef,
    ...props
  }: TextareaHTMLAttributes<HTMLTextAreaElement> & { inputRef: RefObject<HTMLTextAreaElement> }) {
    return <textarea ref={inputRef} className={`${styles.promptInput} nodrag nopan`} {...props} />
  },
  Footer(props: HTMLAttributes<HTMLElement>) {
    return <footer className={styles.footer} {...props} />
  },
  Submit(props: ButtonHTMLAttributes<HTMLButtonElement>) {
    return (
      <button
        className={styles.sendButton}
        data-disabled={dataBoolean(props.disabled)}
        aria-label="提交内容"
        {...props}
      />
    )
  },
}
