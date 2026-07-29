import { FeatureErrorBoundary } from './FeatureErrorBoundary'
import { useExtensionSlot } from './ExtensionSlot.logic'

type Props = {
  name: string
  slotProps?: Record<string, unknown>
}

export function ExtensionSlot({ name, slotProps = {} }: Props) {
  const contributions = useExtensionSlot(name)

  return contributions.map((contribution) => {
    const Contribution = contribution.component
    return (
      <FeatureErrorBoundary key={contribution.id} contributionId={contribution.id}>
        <Contribution {...slotProps} />
      </FeatureErrorBoundary>
    )
  })
}
