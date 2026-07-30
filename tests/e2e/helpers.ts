import { expect, type APIRequestContext, type Page, type Route } from '@playwright/test'

export type MaterialType = 'text' | 'image' | 'video'

export type TestMaterialNode = {
  id: string
  position: { x: number; y: number }
  width: number
  height: number
  data: {
    materialType: MaterialType
    title: string
    status: 'empty' | 'ready' | 'running' | 'done' | 'error'
    value: {
      text?: string
      url?: string
      localPath?: string
      fileName?: string
      mimeType?: string
      submitId?: string
      provider?: string
    }
    messages: Array<{
      id: string
      role: 'user' | 'assistant'
      text: string
      createdAt: number
    }>
  }
}

export type TestWorkflow = {
  id: string
  title: string
  revision: number
  createdAt: number
  updatedAt: number
  graph: {
    nodes: TestMaterialNode[]
    edges: Array<{ id?: string; source: string; target: string }>
  }
}

export function materialNode(
  id: string,
  materialType: MaterialType,
  title: string,
  position: { x: number; y: number },
  value: TestMaterialNode['data']['value'] = {},
): TestMaterialNode {
  return {
    id,
    position,
    width: materialType === 'text' ? 360 : 560,
    height: materialType === 'text' ? 220 : 280,
    data: {
      materialType,
      title,
      status: Object.keys(value).length ? 'ready' : 'empty',
      value,
      messages: [],
    },
  }
}

export async function createWorkflow(
  request: APIRequestContext,
  title: string,
  nodes: TestMaterialNode[] = [],
  edges: TestWorkflow['graph']['edges'] = [],
) {
  const response = await request.post('/api/workflows', {
    data: {
      title,
      graph: { nodes, edges },
    },
  })
  expect(response.ok()).toBe(true)
  return await response.json() as TestWorkflow
}

export async function getWorkflow(request: APIRequestContext, workflowId: string) {
  const response = await request.get(`/api/workflows/${workflowId}`)
  expect(response.ok()).toBe(true)
  return await response.json() as TestWorkflow
}

export async function expectWorkflow(
  request: APIRequestContext,
  workflowId: string,
  predicate: (workflow: TestWorkflow) => boolean,
) {
  await expect.poll(async () => predicate(await getWorkflow(request, workflowId))).toBe(true)
}

export async function patchWorkflowNode(
  request: APIRequestContext,
  workflowId: string,
  nodeId: string,
  input: {
    status?: TestMaterialNode['data']['status']
    value?: TestMaterialNode['data']['value']
    message?: string
  },
) {
  const workflow = await getWorkflow(request, workflowId)
  const ops: unknown[] = []
  if (input.status) ops.push({ type: 'setNodeStatus', nodeId, status: input.status })
  if (input.value) ops.push({ type: 'setNodeValue', nodeId, value: input.value })
  if (input.message) {
    ops.push({
      type: 'appendNodeMessage',
      nodeId,
      message: {
        id: `e2e-message-${Date.now()}`,
        role: 'assistant',
        text: input.message,
        createdAt: Date.now(),
      },
    })
  }
  const response = await request.patch(`/api/workflows/${workflowId}`, {
    data: { baseRevision: workflow.revision, ops },
  })
  expect(response.ok()).toBe(true)
  return await response.json()
}

export async function mockInvokableAgent(page: Page) {
  await page.route('**/api/agents', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        agents: [
          {
            id: 'e2e-agent',
            label: 'E2E Agent',
            vendor: 'Test',
            protocol: 'stdin',
            available: true,
            invokable: true,
            binPath: '/tmp/e2e-agent',
            fallbackModels: [{ id: 'default', label: 'Default' }],
          },
        ],
        installedCount: 1,
        invokableCount: 1,
        platform: 'e2e',
      }),
    })
  })
}

export async function mockVisualModels(page: Page) {
  await page.route('**/api/visual-models', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        models: [
          {
            id: 'test-visual',
            label: 'E2E Visual Provider',
            vendor: 'Test',
            available: true,
            invokable: true,
            capabilities: ['text2image', 'text2video'],
          },
        ],
        installedCount: 1,
        invokableCount: 1,
      }),
    })
  })
}

export async function fulfillSse(pageRoute: Route, events: unknown[]) {
  await pageRoute.fulfill({
    status: 200,
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache',
    },
    body: events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join(''),
  })
}

export function flowNode(page: Page, nodeId: string) {
  return page.locator(`.react-flow__node[data-id="${nodeId}"]`)
}
