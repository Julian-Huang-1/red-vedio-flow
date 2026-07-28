import type {
  HTMLAttributes,
  InputHTMLAttributes,
  RefObject,
  TextareaHTMLAttributes,
} from 'react'
import { dataBoolean } from '../../../ui/dataAttributes'
import styles from './MaterialNode.module.less'

export const MaterialNodePrimitive = {
  Root({
    selected,
    ...props
  }: HTMLAttributes<HTMLElement> & { selected?: boolean }) {
    return <article className={styles.nodeWrap} data-selected={dataBoolean(selected)} {...props} />
  },
  Title(props: HTMLAttributes<HTMLDivElement>) {
    return <div className={styles.title} {...props} />
  },
  Status(props: HTMLAttributes<HTMLSpanElement>) {
    return <span className={styles.status} {...props} />
  },
  Body(props: HTMLAttributes<HTMLDivElement>) {
    return <div className={styles.body} {...props} />
  },
  Editor({
    editorRef,
    ...props
  }: TextareaHTMLAttributes<HTMLTextAreaElement> & { editorRef: RefObject<HTMLTextAreaElement> }) {
    return <textarea ref={editorRef} className={`${styles.inlineEditor} nodrag nopan`} {...props} />
  },
  FileInput({
    inputRef,
    ...props
  }: InputHTMLAttributes<HTMLInputElement> & { inputRef: RefObject<HTMLInputElement> }) {
    return <input ref={inputRef} className="hidden" type="file" {...props} />
  },
}

