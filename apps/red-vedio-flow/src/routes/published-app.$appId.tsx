import { createFileRoute } from '@tanstack/react-router'
import { PublishedAppPage } from '@/pages/published-app/PublishedAppPage'

export const Route = createFileRoute('/published-app/$appId')({
  component: PublishedAppRoute,
})

function PublishedAppRoute() {
  const { appId } = Route.useParams()
  return <PublishedAppPage appId={appId} />
}
