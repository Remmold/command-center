import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Page } from '@playwright/test'
import { expect, test } from './harness'

async function typeAtEnd(page: Page, text: string): Promise<void> {
  const editor = page.getByRole('region', { name: 'Context editor' }).locator('.monaco-editor').first()
  await expect(editor).toBeVisible()
  await editor.click()
  await page.keyboard.press('Control+End')
  await page.keyboard.type(text)
}

test('Context lists the seeded CLAUDE.md with its count, saves an edit to disk with Ctrl+S, and refuses broken JSON', async ({ launched }) => {
  const { page, workspace } = launched
  const claudeMd = join(workspace, 'CLAUDE.md')
  const settings = join(workspace, '.claude', 'settings.json')
  writeFileSync(claudeMd, 'x'.repeat(400))
  mkdirSync(join(workspace, '.claude'), { recursive: true })
  writeFileSync(settings, '{}')

  await page.keyboard.press('Control+4')
  const view = page.getByTestId('view-context')
  await expect(view.getByRole('navigation', { name: 'Workspaces' }).getByRole('button', { name: 'e2e-workspace · ~100' })).toBeVisible()
  const repo = view.getByRole('region', { name: 'Repo' })
  const repoMd = repo.getByRole('button', { name: /^CLAUDE\.md ~100/ })
  await expect(repoMd).toBeVisible()

  await repoMd.click()
  await typeAtEnd(page, 'yyyy')
  await page.keyboard.press('Control+s')
  await expect.poll(() => readFileSync(claudeMd, 'utf-8')).toBe(`${'x'.repeat(400)}yyyy`)
  await expect(repo.getByRole('button', { name: /^CLAUDE\.md ~101/ })).toBeVisible()

  await repo.getByRole('button', { name: /\.claude\/settings\.json/ }).click()
  await typeAtEnd(page, 'oops')
  await page.keyboard.press('Control+s')
  await expect(view.getByRole('status').filter({ hasText: /^Not saved\. Invalid JSON: / })).toBeVisible()
  expect(readFileSync(settings, 'utf-8')).toBe('{}')
})
