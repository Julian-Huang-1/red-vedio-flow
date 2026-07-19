import { expect, test } from '@playwright/test'

test('creates a workflow, adds a text node, edits it, and opens management panels', async ({ page }) => {
  const consoleErrors: string[] = []
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text())
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
