import { createFileRoute } from '@tanstack/react-router'
import { WorkflowPage } from '@/pages/workflow/WorkflowPage'

export const Route = createFileRoute('/workflow')({
  component: WorkflowPage,
})
