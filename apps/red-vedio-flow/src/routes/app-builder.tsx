import { createFileRoute } from '@tanstack/react-router'
import { AppBuilderPage } from '@/pages/app-builder/AppBuilderPage'

export const Route = createFileRoute('/app-builder')({
  component: AppBuilderPage,
})
