import type { ButtonHTMLAttributes, FormHTMLAttributes, HTMLAttributes } from 'react'
import styles from '../../../App.module.less'

type DataBoolean = true | undefined

type HeaderActionVariant = 'challenge' | 'market' | 'member'
type HeroCardTone = 'orange' | 'blue' | 'mono'
type StartActionVariant = 'primary' | 'secondary'

function dataBoolean(value?: boolean): DataBoolean {
  return value ? true : undefined
}

export const StartHeaderPrimitive = {
  Root(props: HTMLAttributes<HTMLElement>) {
    return <header className={styles.startHeader} {...props} />
  },
  Brand(props: HTMLAttributes<HTMLDivElement>) {
    return <div className={styles.startBrand} {...props} />
  },
  LogoMark(props: HTMLAttributes<HTMLSpanElement>) {
    return <span className={styles.logoMark} {...props} />
  },
  Nav(props: HTMLAttributes<HTMLElement>) {
    return <nav className={styles.startNav} {...props} />
  },
  Action({
    variant,
    disabled,
    ...props
  }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: HeaderActionVariant }) {
    return <button data-disabled={dataBoolean(disabled)} data-variant={variant} disabled={disabled} {...props} />
  },
}

export const RecentWorkflowRailPrimitive = {
  Root(props: HTMLAttributes<HTMLDivElement>) {
    return <div className={styles.heroRail} {...props} />
  },
  Arrow(props: ButtonHTMLAttributes<HTMLButtonElement>) {
    return <button className={styles.carouselArrow} {...props} />
  },
  Card({
    as = 'button',
    tone,
    placeholder,
    ...props
  }: (ButtonHTMLAttributes<HTMLButtonElement> & HTMLAttributes<HTMLDivElement>) & {
    as?: 'button' | 'div'
    tone: HeroCardTone
    placeholder?: boolean
  }) {
    const Component = as
    return (
      <Component
        className={styles.heroCard}
        data-placeholder={dataBoolean(placeholder)}
        data-tone={tone}
        {...props}
      />
    )
  },
  Logo(props: HTMLAttributes<HTMLSpanElement>) {
    return <span className={styles.cardLogo} {...props} />
  },
  Scene(props: HTMLAttributes<HTMLSpanElement>) {
    return <span className={styles.cardScene} {...props} />
  },
  Dots(props: HTMLAttributes<HTMLDivElement>) {
    return <div className={styles.heroDots} {...props} />
  },
  Dot({ active, ...props }: HTMLAttributes<HTMLSpanElement> & { active?: boolean }) {
    return <span data-active={dataBoolean(active)} {...props} />
  },
}

export const StartActionsPrimitive = {
  Root(props: HTMLAttributes<HTMLDivElement>) {
    return <div className={styles.startActions} {...props} />
  },
  Button({
    variant,
    disabled,
    ...props
  }: ButtonHTMLAttributes<HTMLButtonElement> & { variant: StartActionVariant }) {
    return (
      <button
        className={styles.startActionButton}
        data-disabled={dataBoolean(disabled)}
        data-variant={variant}
        disabled={disabled}
        {...props}
      />
    )
  },
}

export const InspirationBoxPrimitive = {
  Root(props: FormHTMLAttributes<HTMLFormElement>) {
    return <form className={styles.inspirationBox} {...props} />
  },
  Footer(props: HTMLAttributes<HTMLDivElement>) {
    return <div className={styles.inspirationFooter} {...props} />
  },
  Tools(props: HTMLAttributes<HTMLDivElement>) {
    return <div {...props} />
  },
  IconButton(props: ButtonHTMLAttributes<HTMLButtonElement>) {
    return <button type="button" {...props} />
  },
  Submit(props: ButtonHTMLAttributes<HTMLButtonElement>) {
    return <button data-variant="submit" type="submit" {...props} />
  },
}

export const SkillChipsPrimitive = {
  Root(props: HTMLAttributes<HTMLDivElement>) {
    return <div className={styles.skillChips} {...props} />
  },
  Chip(props: ButtonHTMLAttributes<HTMLButtonElement>) {
    return <button {...props} />
  },
  Thumb(props: HTMLAttributes<HTMLSpanElement>) {
    return <span className={styles.chipThumb} {...props} />
  },
}
