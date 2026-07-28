import type {
  ButtonHTMLAttributes,
  HTMLAttributes,
  LabelHTMLAttributes,
  RefObject,
  TextareaHTMLAttributes,
} from 'react'
import { dataBoolean } from '../../ui/dataAttributes'
import styles from './AgentDrawer.module.less'

export const AgentComposerPrimitive = {
  Root(props: HTMLAttributes<HTMLElement>) {
    return <footer className={styles.composer} {...props} />
  },
  Input({
    inputRef,
    ...props
  }: TextareaHTMLAttributes<HTMLTextAreaElement> & { inputRef: RefObject<HTMLTextAreaElement> }) {
    return <textarea ref={inputRef} {...props} />
  },
  Footer(props: HTMLAttributes<HTMLDivElement>) {
    return <div className={styles.composerFooter} {...props} />
  },
  IconButton(props: ButtonHTMLAttributes<HTMLButtonElement>) {
    return <button type="button" {...props} />
  },
  ModelSelect(props: LabelHTMLAttributes<HTMLLabelElement>) {
    return <label className={styles.modelSelect} {...props} />
  },
  ModeButton(props: ButtonHTMLAttributes<HTMLButtonElement>) {
    return <button type="button" className={styles.modeButton} {...props} />
  },
  SendButton(props: ButtonHTMLAttributes<HTMLButtonElement>) {
    return (
      <button
        type="button"
        className={styles.sendButton}
        data-disabled={dataBoolean(props.disabled)}
        {...props}
      />
    )
  },
}
