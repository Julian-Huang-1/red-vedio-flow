import { QueryClientProvider } from '@tanstack/react-query'
import { createRouter, RouterProvider } from '@tanstack/react-router'
import {
  configureWorkflowClient,
  createHttpTransport,
} from '@red-video-flow/workflow-client'
import { queryClient } from '@/lib/queryClient'
import { routeTree } from './routeTree.gen'

const deploymentBasePath = window.location.pathname.match(/^\/s\/[^/]+/)?.[0] ?? ''

configureWorkflowClient(createHttpTransport({ baseUrl: deploymentBasePath }))

const router = createRouter({
  routeTree,
  basepath: deploymentBasePath || undefined,
})

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  )
}
