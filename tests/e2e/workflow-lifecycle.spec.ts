import { expect, test } from '@playwright/test'
import {
  createWorkflow,
  expectWorkflow,
  flowNode,
  getWorkflow,
  materialNode,
} from './helpers'

test.describe('workflow lifecycle happy paths', () => {
  test('persists node content and position, reloads it, and reopens it from home history', async ({ page, request }) => {
    const title = `Lifecycle ${Date.now()}`
    const node = materialNode(
      'lifecycle-text',
      'text',
      '生命周期文本',
      { x: 180, y: 180 },
      { text: '刷新前的内容' },
    )
    const workflow = await createWorkflow(request, title, [node])

    await page.goto(`/canvas/${workflow.id}`)
    const renderedNode = flowNode(page, node.id)
    await expect(renderedNode).toBeVisible()
    await renderedNode.getByText('刷新前的内容').dblclick()
    const editor = renderedNode.getByPlaceholder('输入文本内容')
    await editor.fill('刷新后仍然存在的内容')
    await expectWorkflow(
      request,
      workflow.id,
      (current) => current.graph.nodes[0].data.value.text === '刷新后仍然存在的内容',
    )

    const beforePosition = (await getWorkflow(request, workflow.id)).graph.nodes[0].position
    await page.locator('.react-flow__pane').click({ position: { x: 1050, y: 650 } })
    const box = await renderedNode.getByText('生命周期文本').boundingBox()
    expect(box).not.toBeNull()
    await page.mouse.move(box!.x + 40, box!.y + 18)
    await page.mouse.down()
    await page.mouse.move(box!.x + 170, box!.y + 95, { steps: 12 })
    await page.mouse.up()

    await expectWorkflow(request, workflow.id, (current) => {
      const currentNode = current.graph.nodes.find((item) => item.id === node.id)
      return Boolean(
        currentNode
        && currentNode.position.x !== beforePosition.x
        && currentNode.position.y !== beforePosition.y,
      )
    })

    await page.reload()
    await expect(flowNode(page, node.id).getByText('刷新后仍然存在的内容')).toBeVisible()

    await page.getByRole('button', { name: '回到首页' }).click()
    await expect(page).toHaveURL('/')
    await page.getByRole('button').filter({ hasText: title }).click()
    await expect(page).toHaveURL(`/canvas/${workflow.id}`)
    await expect(flowNode(page, node.id).getByText('刷新后仍然存在的内容')).toBeVisible()
  })

  test('creates, switches, and deletes canvases', async ({ page, request }) => {
    const suffix = Date.now()
    const first = await createWorkflow(request, `Canvas A ${suffix}`)
    const second = await createWorkflow(request, `Canvas B ${suffix}`)

    await page.goto(`/canvas/${first.id}`)
    await expect(page.getByTitle(`Canvas A ${suffix}`)).toBeVisible()

    await page.getByRole('button', { name: '切换画布' }).click()
    let menu = page.getByRole('menu', { name: '切换画布' })
    await menu.getByRole('button').filter({ hasText: `Canvas B ${suffix}` }).click()
    await expect(page).toHaveURL(`/canvas/${second.id}`)

    await page.getByRole('button', { name: '切换画布' }).click()
    menu = page.getByRole('menu', { name: '切换画布' })
    await menu.getByRole('button', { name: '新建画布' }).click()
    await expect(page).toHaveURL(/\/canvas\/workflow-/)
    const createdWorkflowId = page.url().split('/').pop()
    expect(createdWorkflowId).toBeTruthy()
    await expectWorkflow(request, createdWorkflowId!, (current) => Boolean(current.id))

    await page.getByRole('button', { name: '切换画布' }).click()
    menu = page.getByRole('menu', { name: '切换画布' })
    await menu.getByRole('button').filter({ hasText: `Canvas A ${suffix}` }).click()
    await expect(page).toHaveURL(`/canvas/${first.id}`)

    await page.getByRole('button', { name: '切换画布' }).click()
    menu = page.getByRole('menu', { name: '切换画布' })
    const activeRow = menu.locator('[data-active]').filter({ hasText: `Canvas A ${suffix}` })
    page.once('dialog', (dialog) => dialog.accept())
    await activeRow.locator('button[title^="删除画布"]').click()
    await expect(page).not.toHaveURL(`/canvas/${first.id}`)
    const deletedResponse = await request.get(`/api/workflows/${first.id}`)
    expect(deletedResponse.status()).toBe(404)
  })

  test('uploads and restores image and video assets', async ({ page, request }) => {
    const image = materialNode('upload-image', 'image', '上传图片节点', { x: 80, y: 140 })
    const video = materialNode('upload-video', 'video', '上传视频节点', { x: 760, y: 140 })
    const workflow = await createWorkflow(request, `Uploads ${Date.now()}`, [image, video])
    await page.goto(`/canvas/${workflow.id}`)

    const png = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
      'base64',
    )
    await flowNode(page, image.id).locator('input[type="file"]').setInputFiles({
      name: 'happy-path.png',
      mimeType: 'image/png',
      buffer: png,
    })
    await flowNode(page, video.id).locator('input[type="file"]').setInputFiles({
      name: 'happy-path.mp4',
      mimeType: 'video/mp4',
      buffer: Buffer.from('e2e-video-placeholder'),
    })

    await expectWorkflow(request, workflow.id, (current) => {
      const imageNode = current.graph.nodes.find((node) => node.id === image.id)
      const videoNode = current.graph.nodes.find((node) => node.id === video.id)
      return imageNode?.data.status === 'ready'
        && imageNode.data.value.url?.startsWith('/api/assets/') === true
        && Boolean(imageNode.data.value.localPath)
        && videoNode?.data.status === 'ready'
        && videoNode.data.value.url?.startsWith('/api/assets/') === true
        && Boolean(videoNode.data.value.localPath)
    })

    await expect(flowNode(page, image.id).locator('img')).toHaveAttribute('src', /\/api\/assets\//)
    await expect(flowNode(page, video.id).locator('video')).toHaveAttribute('src', /\/api\/assets\//)
    await page.reload()
    await expect(flowNode(page, image.id).locator('img')).toBeVisible()
    await expect(flowNode(page, video.id).locator('video')).toBeAttached()
  })

  test('connects upstream and downstream nodes and restores the edge', async ({ page, request }) => {
    const source = materialNode(
      'connect-source',
      'text',
      '连接源节点',
      { x: 80, y: 180 },
      { text: '上游内容' },
    )
    const target = materialNode('connect-target', 'image', '连接目标节点', { x: 760, y: 180 })
    const workflow = await createWorkflow(request, `Connections ${Date.now()}`, [source, target])
    await page.goto(`/canvas/${workflow.id}`)

    const sourceHandle = flowNode(page, source.id).locator('.react-flow__handle.source')
    const targetHandle = flowNode(page, target.id).locator('.react-flow__handle.target')
    await expect(sourceHandle).toBeVisible()
    await expect(targetHandle).toBeVisible()
    const sourceBox = await sourceHandle.boundingBox()
    const targetBox = await targetHandle.boundingBox()
    expect(sourceBox).not.toBeNull()
    expect(targetBox).not.toBeNull()

    await page.mouse.move(sourceBox!.x + sourceBox!.width / 2, sourceBox!.y + sourceBox!.height / 2)
    await page.mouse.down()
    await page.mouse.move(targetBox!.x + targetBox!.width / 2, targetBox!.y + targetBox!.height / 2, {
      steps: 16,
    })
    await page.mouse.up()

    await expectWorkflow(
      request,
      workflow.id,
      (current) => current.graph.edges.some((edge) => edge.source === source.id && edge.target === target.id),
    )
    await expect(page.locator('.react-flow__edge')).toHaveCount(1)
    await page.reload()
    await expect(page.locator('.react-flow__edge')).toHaveCount(1)
  })

  test('pans the canvas with a two-finger scroll gesture without changing zoom', async ({ page, request }) => {
    const node = materialNode(
      'trackpad-pan-node',
      'text',
      '双指拖动画布',
      { x: 420, y: 260 },
      { text: '用于观察视口移动' },
    )
    const workflow = await createWorkflow(request, `Trackpad pan ${Date.now()}`, [node])
    await page.goto(`/canvas/${workflow.id}`)

    const viewport = page.locator('.react-flow__viewport')
    const zoomIndicator = page.getByLabel(/当前画布缩放比例/)
    const initialTransform = await viewport.evaluate((element) => getComputedStyle(element).transform)
    const initialZoom = await zoomIndicator.textContent()

    await page.locator('.react-flow__pane').hover({ position: { x: 900, y: 620 } })
    await page.mouse.wheel(140, 180)

    await expect(page.locator('.react-flow__pane')).toHaveCSS('cursor', 'grabbing')
    await expect.poll(
      async () => viewport.evaluate((element) => getComputedStyle(element).transform),
    ).not.toBe(initialTransform)
    await expect(zoomIndicator).toHaveText(initialZoom ?? '70%')
    await expect(page.locator('.react-flow__pane')).toHaveCSS('cursor', 'default')
  })

  test('does not pan the canvas when dragging the empty pane with the left button', async ({ page, request }) => {
    const node = materialNode(
      'left-drag-node',
      'text',
      '左键拖动保持视口',
      { x: 420, y: 260 },
      { text: '节点仍可单独拖动' },
    )
    const workflow = await createWorkflow(request, `Left drag ${Date.now()}`, [node])
    await page.goto(`/canvas/${workflow.id}`)

    const viewport = page.locator('.react-flow__viewport')
    const pane = page.locator('.react-flow__pane')
    const initialTransform = await viewport.evaluate((element) => getComputedStyle(element).transform)
    const paneBox = await pane.boundingBox()
    expect(paneBox).not.toBeNull()

    await page.mouse.move(paneBox!.x + 900, paneBox!.y + 620)
    await page.mouse.down({ button: 'left' })
    await page.mouse.move(paneBox!.x + 700, paneBox!.y + 480, { steps: 12 })
    await page.mouse.up({ button: 'left' })

    await expect.poll(
      async () => viewport.evaluate((element) => getComputedStyle(element).transform),
    ).toBe(initialTransform)
  })

  test('shows grab and grabbing cursors while dragging a node card', async ({ page, request }) => {
    const node = materialNode(
      'node-drag-cursor',
      'text',
      '节点拖动光标',
      { x: 420, y: 260 },
      { text: '拖动我' },
    )
    const workflow = await createWorkflow(request, `Node cursor ${Date.now()}`, [node])
    await page.goto(`/canvas/${workflow.id}`)

    const renderedNode = flowNode(page, node.id)
    const body = renderedNode.getByText('拖动我')
    await body.hover()
    await expect(body).toHaveCSS('cursor', 'grab')
    const box = await body.boundingBox()
    expect(box).not.toBeNull()

    await page.mouse.move(box!.x + 20, box!.y + 20)
    await page.mouse.down({ button: 'left' })
    await page.mouse.move(box!.x + 90, box!.y + 65, { steps: 8 })
    await expect(body).toHaveCSS('cursor', 'grabbing')
    await page.mouse.up({ button: 'left' })
    await expect(body).toHaveCSS('cursor', 'grab')
  })
})
