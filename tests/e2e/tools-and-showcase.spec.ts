import { expect, test } from '@playwright/test'
import { createWorkflow, flowNode, materialNode } from './helpers'

test.describe('management tools and component showcase happy paths', () => {
  test('filters, searches, and locates assets, then opens every canvas tool panel', async ({ page, request }) => {
    const text = materialNode(
      'asset-text',
      'text',
      '资产文本',
      { x: 80, y: 120 },
      { text: '文本资产' },
    )
    const image = materialNode(
      'asset-image',
      'image',
      '目标图片资产',
      { x: 650, y: 120 },
      { url: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="2" height="2"/>' },
    )
    const video = materialNode(
      'asset-video',
      'video',
      '资产视频',
      { x: 1250, y: 120 },
      { text: '视频生成记录' },
    )
    const workflow = await createWorkflow(request, `Asset Manager ${Date.now()}`, [text, image, video])
    await page.goto(`/canvas/${workflow.id}`)

    await page.getByRole('button', { name: '资产管理' }).click()
    const manager = page.getByRole('dialog', { name: '资产管理' })
    await expect(manager.getByText('资产文本', { exact: true })).toBeVisible()
    await manager.getByLabel('筛选节点类型').selectOption('image')
    await expect(manager.getByText('资产文本', { exact: true })).toHaveCount(0)
    await expect(manager.getByText('目标图片资产', { exact: true })).toBeVisible()
    await manager.getByPlaceholder('搜索节点').fill('目标图片')
    await manager.getByRole('button', { name: '定位到节点' }).click()
    await expect(flowNode(page, image.id).locator('article[data-selected]')).toBeVisible()

    await manager.getByRole('button', { name: '资产', exact: true }).click()
    await expect(manager.getByText(/上传图片、视频或生成结果后/)).toBeVisible()
    await manager.getByRole('button', { name: '画布', exact: true }).click()
    await manager.getByRole('button', { name: '收起资产管理' }).click()
    await expect(manager).toBeHidden()

    const panelExpectations = [
      { button: '工具箱', heading: '工具箱', content: '大师分镜九宫格' },
      { button: '素材库', heading: '素材库', content: '风格库' },
      { button: '角色库', heading: '角色库', content: '角色资产会在这里集中管理。' },
      { button: '历史记录', heading: '历史记录', content: '生成历史会在这里集中管理。' },
      { button: '快捷键', heading: '快捷键', content: 'Option + Shift + F' },
    ]

    for (const item of panelExpectations) {
      await page.getByRole('button', { name: item.button }).click()
      await expect(page.getByRole('heading', { name: item.heading })).toBeVisible()
      await expect(page.getByText(item.content, { exact: true })).toBeVisible()
    }
    await page.getByRole('button', { name: '关闭' }).click()
    await expect(page.getByRole('heading', { name: '快捷键' })).toHaveCount(0)
  })

  test('searches component registry previews and copies code and prompts', async ({ context, page }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write'])
    await page.goto('/components')
    await expect(page.getByRole('heading', { name: 'Component Registry' })).toBeVisible()

    const search = page.getByPlaceholder('搜索组件')
    await search.fill('StartHeader')
    const startHeaderItem = page.getByRole('button', { name: /StartHeader/ })
    await expect(startHeaderItem).toBeVisible()
    await startHeaderItem.click()
    await expect(page.getByRole('heading', { name: 'StartHeader' })).toBeVisible()
    await expect(page.getByText('red-vedio-flow', { exact: true })).toBeVisible()

    await page.getByRole('button', { name: '复制 Code' }).click()
    await expect.poll(async () => page.evaluate(() => navigator.clipboard.readText())).toContain('StartHeader')
    await page.getByRole('button', { name: '复制 Prompt' }).click()
    await expect.poll(async () => page.evaluate(() => navigator.clipboard.readText())).toContain('Radix composition')

    await search.fill('MaterialNode')
    await page.getByRole('button', { name: /MaterialNode/ }).click()
    await expect(page.getByRole('heading', { name: 'MaterialNode' })).toBeVisible()
    await expect(page.getByText('文本节点 空态')).toBeVisible()
    await expect(page.getByText('图片节点 已上传')).toBeVisible()
  })
})
