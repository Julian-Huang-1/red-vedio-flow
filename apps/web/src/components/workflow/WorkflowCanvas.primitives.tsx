import type { HTMLAttributes } from 'react'
import { dataBoolean } from '../../ui/dataAttributes'

export const WorkflowCanvasPrimitive = {
  Root({
    empty,
    panning,
    ...props
  }: HTMLAttributes<HTMLElement> & { empty?: boolean; panning?: boolean }) {
    return (
      <section
        className="absolute inset-0"
        data-empty={dataBoolean(empty)}
        data-panning={dataBoolean(panning)}
        {...props}
      />
    )
  },
  Empty(props: HTMLAttributes<HTMLDivElement>) {
    return (
      <div
        className="pointer-events-none absolute left-1/2 top-[32%] z-10 -translate-x-1/2 text-sm text-zinc-500"
        {...props}
      />
    )
  },
}
