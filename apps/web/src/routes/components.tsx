import { createFileRoute } from '@tanstack/react-router'
import { ComponentShowcase } from '../pages/component-showcase/ComponentShowcase'

export const Route = createFileRoute('/components')({
  component: ComponentShowcase,
})
