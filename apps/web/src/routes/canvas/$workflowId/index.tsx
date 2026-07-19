import { createFileRoute } from '@tanstack/react-router'
import { CanvasEditorPage } from '../../../pages/canvas-editor/CanvasEditorPage'

export const Route = createFileRoute('/canvas/$workflowId/')({
  component: CanvasRoute,
})

function CanvasRoute() {
  const { workflowId } = Route.useParams()
  return <CanvasEditorPage workflowId={workflowId} />
}
