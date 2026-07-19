import { Plus } from 'lucide-react'
import { StartActionsPrimitive as Actions } from './HomePrimitives'

type StartActionsProps = {
  disabled: boolean
  isCreating: boolean
  onCreate: () => void
}

export function StartActions({ disabled, isCreating, onCreate }: StartActionsProps) {
  return (
    <Actions.Root>
      <Actions.Button variant="primary" disabled={disabled} onClick={onCreate}>
        <Plus size={22} />
        <span>{isCreating ? '创建中' : '开始创作'}</span>
      </Actions.Button>
      <Actions.Button variant="secondary" disabled={disabled}>
        快速体验 Seedance 2.0
      </Actions.Button>
    </Actions.Root>
  )
}
