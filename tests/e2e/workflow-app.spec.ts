import { expect, test } from '@playwright/test'

test('creates a workflow, adds a text node, edits it, and opens management panels', async ({ page }) => {
  const consoleErrors: string[] = []
  const workflowWrites: Array<{ method: string; url: string }> = []
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text())
  })
  page.on('request', (request) => {
    if (/\/api\/workflows\/[^/]+$/.test(request.url()) && ['PATCH', 'PUT'].includes(request.method())) {
      workflowWrites.push({ method: request.method(), url: request.url() })
    }
  })

  await page.goto('/')
  const startButton = page.locator('button').filter({ hasText: '开始创作' }).first()
  await expect(startButton).toBeVisible()

  await startButton.click()
  await expect(page).toHaveURL(/\/canvas\/workflow-/)
  await expect(page.getByText('右击画布生成节点')).toBeVisible()

  await page.getByRole('button', { name: '添加节点' }).click()
  await expect(page.getByText('添加节点')).toBeVisible()
  await page.getByRole('button', { name: '文本' }).click()

  await expect(page.getByText('暂无文本内容')).toBeVisible()
  await page.getByText('暂无文本内容').dblclick()
  const editor = page.getByPlaceholder('输入文本内容')
  await editor.fill('一个用于 e2e 的短视频脚本开头')
  await expect(editor).toHaveValue('一个用于 e2e 的短视频脚本开头')
  await expect.poll(() => workflowWrites.filter((request) => request.method === 'PATCH').length).toBeGreaterThan(0)
  const settledWriteCount = workflowWrites.length
  await page.waitForTimeout(1_500)
  expect(workflowWrites).toHaveLength(settledWriteCount)
  expect(workflowWrites.filter((request) => request.method === 'PUT')).toHaveLength(0)

  await page.getByRole('button', { name: '资产管理' }).click()
  const assetManager = page.getByRole('dialog', { name: '资产管理' })
  await expect(assetManager).toBeVisible()
  await expect(assetManager.getByText('文本节点')).toBeVisible()
  await expect(assetManager.getByText(/共 1 节点/)).toBeVisible()

  await page.getByRole('button', { name: '收起资产管理' }).click()
  await expect(page.getByRole('dialog', { name: '资产管理' })).toBeHidden()

  await page.getByRole('button', { name: '工具箱' }).click()
  await expect(page.getByRole('heading', { name: '工具箱' })).toBeVisible()
  await expect(page.getByRole('button', { name: /大师分镜九宫格/ })).toBeVisible()

  await expect.poll(() => consoleErrors).toEqual([])
})

test('refreshes a running workflow until an external result is written back', async ({ page, request }) => {
  const now = Date.now()
  const createResponse = await request.post('/api/workflows', {
    data: {
      title: 'Running workflow',
      graph: {
        nodes: [
          {
            id: 'video-running',
            position: { x: 120, y: 120 },
            width: 560,
            height: 280,
            data: {
              materialType: 'video',
              title: '轮询测试视频',
              status: 'running',
              value: {},
              messages: [
                {
                  id: `message-${now}`,
                  role: 'user',
                  text: '生成测试视频',
                  createdAt: now,
                },
              ],
            },
          },
        ],
        edges: [],
      },
    },
  })
  expect(createResponse.ok()).toBe(true)
  const workflow = await createResponse.json()

  await page.goto(`/canvas/${workflow.id}`)
  await expect(page.getByText('轮询测试视频')).toBeVisible()
  await expect(page.getByText('生成中')).toBeVisible()

  await expect.poll(async () => {
    const latestResponse = await request.get(`/api/workflows/${workflow.id}`)
    const latestWorkflow = await latestResponse.json()
    const patchResponse = await request.patch(`/api/workflows/${workflow.id}`, {
      data: {
        baseRevision: latestWorkflow.revision,
        ops: [
          { type: 'setNodeStatus', nodeId: 'video-running', status: 'done' },
          {
            type: 'setNodeValue',
            nodeId: 'video-running',
            value: { text: '后台任务已经完成' },
          },
        ],
      },
    })
    return patchResponse.ok()
  }).toBe(true)

  await expect(page.getByText('完成', { exact: true })).toBeVisible({ timeout: 8_000 })
  await expect(page.getByText('后台任务已经完成')).toBeVisible()
})
