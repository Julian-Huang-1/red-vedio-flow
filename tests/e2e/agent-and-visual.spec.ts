import { expect, test } from '@playwright/test'
import {
  createWorkflow,
  expectWorkflow,
  flowNode,
  fulfillSse,
  materialNode,
  mockInvokableAgent,
  mockVisualModels,
  patchWorkflowNode,
  type MaterialType,
} from './helpers'

test.describe('Agent and visual generation happy paths', () => {
  test('runs a text node with a selected local Agent and persists the result', async ({ page, request }) => {
    await mockInvokableAgent(page)
    const node = materialNode('agent-text-node', 'text', 'Agent 文本节点', { x: 120, y: 180 })
    const workflow = await createWorkflow(request, `Text Agent ${Date.now()}`, [node])
    let payload: Record<string, any> | undefined

    await page.route('**/api/run-node', async (route) => {
      payload = route.request().postDataJSON()
      await fulfillSse(route, [
        { type: 'start', agentId: 'e2e-agent', bin: '/tmp/e2e-agent', argv: [] },
        { type: 'delta', text: 'Agent 正在生成' },
        { type: 'done', code: 0, output: '由 E2E Agent 生成的完整文本' },
      ])
    })

    await page.goto(`/canvas/${workflow.id}`)
    await flowNode(page, node.id).getByText('暂无文本内容').click()
    const prompt = page.getByPlaceholder(/给 AI 的生成指令/)
    await expect(prompt).toBeVisible()
    await prompt.fill('生成一段短视频开场')
    await page.getByRole('button', { name: '提交内容' }).click()

    await expect(flowNode(page, node.id).getByText('由 E2E Agent 生成的完整文本')).toBeVisible()
    expect(payload?.agentId).toBe('e2e-agent')
    expect(payload?.currentNode.id).toBe(node.id)
    expect(payload?.prompt).toBe('生成一段短视频开场')
    await expectWorkflow(request, workflow.id, (current) => {
      const currentNode = current.graph.nodes.find((item) => item.id === node.id)
      return currentNode?.data.status === 'done'
        && currentNode.data.value.text === '由 E2E Agent 生成的完整文本'
    })
  })

  test('supports Agent drawer streaming, @ references, workflow patch refresh, and debugger operations', async ({
    context,
    page,
    request,
  }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write'])
    await mockInvokableAgent(page)
    const node = materialNode(
      'drawer-reference-node',
      'text',
      '被引用的脚本节点',
      { x: 140, y: 180 },
      { text: '修改前脚本' },
    )
    const workflow = await createWorkflow(request, `Drawer Agent ${Date.now()}`, [node])
    const requests: Array<Record<string, any>> = []

    await page.route('**/api/run-node', async (route) => {
      const payload = route.request().postDataJSON() as Record<string, any>
      requests.push(payload)
      if (payload.prompt.includes('制造错误')) {
        await fulfillSse(route, [{ type: 'error', message: 'E2E 可观测错误' }])
        return
      }

      await patchWorkflowNode(request, workflow.id, node.id, {
        status: 'done',
        value: { text: 'Agent 已写回工作流' },
        message: 'Agent 已完成节点修改',
      })
      await fulfillSse(route, [
        { type: 'start', agentId: 'e2e-agent', bin: '/tmp/e2e-agent', argv: ['--chat'] },
        { type: 'delta', text: '正在更新节点' },
        { type: 'done', code: 0, output: '节点修改完成 RVF_WORKFLOW_PATCHED' },
      ])
    })

    await page.goto(`/canvas/${workflow.id}`)
    await page.getByRole('button', { name: '打开 Agent' }).click()
    const drawer = page.getByRole('dialog', { name: 'Agent 助手' })
    const composer = drawer.getByPlaceholder(/开始你的创作/)
    await composer.fill('@')
    await drawer.getByRole('option', { name: /被引用的脚本节点/ }).click()
    await composer.pressSequentially('请修改这个脚本')
    await drawer.getByRole('button', { name: '发送' }).click()

    await expect(drawer.getByText('节点修改完成')).toBeVisible()
    await expect(flowNode(page, node.id).getByText('Agent 已写回工作流')).toBeVisible()
    expect(requests[0].mode).toBe('chat')
    expect(requests[0].referencedNodes).toHaveLength(1)
    expect(requests[0].referencedNodes[0].id).toBe(node.id)

    await composer.fill('制造错误')
    await drawer.getByRole('button', { name: '发送' }).click()
    await expect(drawer.getByText('E2E 可观测错误')).toBeVisible()

    await page.getByRole('button', { name: '打开 Local Server DevTools' }).click()
    const debuggerPanel = page.getByRole('dialog', { name: 'Local Server 调试器' })
    await debuggerPanel.getByRole('button', { name: 'SSE' }).click()
    await expect(debuggerPanel.getByText('SSE', { exact: true }).first()).toBeVisible()
    await debuggerPanel.getByLabel('搜索调试日志').fill('run-node')
    await expect(debuggerPanel.locator('summary').filter({ hasText: '/api/run-node' }).first()).toBeVisible()

    await debuggerPanel.getByRole('button', { name: /错误/ }).click()
    await expect(debuggerPanel.locator('[data-error]')).not.toHaveCount(0)
    await debuggerPanel.getByRole('button', { name: '复制当前日志' }).click()
    await expect.poll(async () => (await page.evaluate(() => navigator.clipboard.readText())).length).toBeGreaterThan(0)
    await debuggerPanel.getByRole('button', { name: '清空日志' }).click()
    await expect(debuggerPanel.getByText('显示 0 / 0 条')).toBeVisible()
  })

  for (const materialType of ['image', 'video'] as const satisfies readonly MaterialType[]) {
    test(`runs a ${materialType} visual node and restores the generated result`, async ({ page, request }) => {
      await mockVisualModels(page)
      const title = materialType === 'image' ? '视觉图片节点' : '视觉视频节点'
      const node = materialNode(`visual-${materialType}`, materialType, title, { x: 100, y: 160 })
      const workflow = await createWorkflow(request, `Visual ${materialType} ${Date.now()}`, [node])
      const resultValue = materialType === 'image'
        ? {
            url: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="2" height="2"/>',
            fileName: 'generated.svg',
            mimeType: 'image/svg+xml',
          }
        : {
            url: 'data:video/mp4;base64,AAAA',
            fileName: 'generated.mp4',
            mimeType: 'video/mp4',
          }
      let payload: Record<string, any> | undefined

      await page.route('**/api/run-visual-node', async (route) => {
        payload = route.request().postDataJSON()
        await patchWorkflowNode(request, workflow.id, node.id, {
          status: 'done',
          value: resultValue,
          message: `${materialType} 生成完成`,
        })
        await fulfillSse(route, [
          { type: 'start', modelId: 'dreamina' },
          { type: 'done', result: { ...resultValue, taskStatus: 'success' } },
        ])
      })

      await page.goto(`/canvas/${workflow.id}`)
      await flowNode(page, node.id)
        .getByText(materialType === 'image' ? '点击上传图片' : '点击上传视频')
        .click()
      await expect(page.getByText('E2E Dreamina')).toBeVisible()
      const prompt = page.getByPlaceholder(materialType === 'image' ? /描述要生成或修改的画面/ : /描述视频动作和镜头/)
      await prompt.fill(`生成 E2E ${materialType}`)
      await page.getByRole('button', { name: '提交内容' }).click()

      await expect(flowNode(page, node.id).getByText('完成', { exact: true })).toBeVisible()
      if (materialType === 'image') {
        await expect(flowNode(page, node.id).locator('img')).toBeVisible()
      } else {
        await expect(flowNode(page, node.id).locator('video')).toBeAttached()
      }
      expect(payload?.nodeKind).toBe(materialType)
      expect(payload?.prompt).toBe(`生成 E2E ${materialType}`)
      await expectWorkflow(request, workflow.id, (current) => {
        const currentNode = current.graph.nodes.find((item) => item.id === node.id)
        return currentNode?.data.status === 'done' && currentNode.data.value.fileName === resultValue.fileName
      })
    })
  }
})
