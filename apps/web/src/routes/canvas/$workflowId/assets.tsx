import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/canvas/$workflowId/assets')({
  component: CanvasAssetsRoute,
})

function CanvasAssetsRoute() {
  const { workflowId } = Route.useParams()

  return (
    <main className="grid h-screen w-screen place-items-center bg-canvas text-white">
      <section className="text-center">
        <h1 className="text-xl font-semibold">画布资产</h1>
        <p className="mt-2 text-sm text-zinc-400">{workflowId}</p>
      </section>
    </main>
  )
}
