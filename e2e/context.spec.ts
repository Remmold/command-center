import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Locator, Page } from '@playwright/test'
import { expect, prompt, test, transcriptsOf } from './harness'

async function typeAtEnd(page: Page, pane: Locator, text: string): Promise<void> {
  const editor = pane.locator('.monaco-editor').first()
  await expect(editor).toBeVisible()
  await editor.click()
  await page.keyboard.press('Control+End')
  await page.keyboard.type(text)
}

test('Context opens the seeded CLAUDE.md rendered, saves an edit with Ctrl+S back to the preview, and keeps broken JSON in edit mode', async ({ launched }) => {
  const { page, workspace } = launched
  const claudeMd = join(workspace, 'CLAUDE.md')
  const settings = join(workspace, '.claude', 'settings.json')
  const head = '---\nowner: e2e-team\n---\n# Seeded rules\n\n'
  const seeded = head + 'x'.repeat(400 - head.length)
  writeFileSync(claudeMd, seeded)
  mkdirSync(join(workspace, '.claude'), { recursive: true })
  writeFileSync(settings, '{}')

  await page.keyboard.press('Control+4')
  const view = page.getByTestId('view-context')
  await expect(view.getByRole('navigation', { name: 'Workspaces' }).getByRole('button', { name: 'e2e-workspace · ~100' })).toBeVisible()
  const repo = view.getByRole('region', { name: 'Repo' })
  const pane = view.getByRole('region', { name: 'Context editor' })
  const repoMd = repo.getByRole('button', { name: /^CLAUDE\.md ~100/ })
  await expect(repoMd).toBeVisible()

  await repoMd.click()
  await expect(pane.getByRole('heading', { name: 'Seeded rules' })).toBeVisible()
  await expect(pane.getByRole('group', { name: 'Frontmatter' })).toContainText('owner')
  await expect(pane.getByRole('group', { name: 'Frontmatter' })).toContainText('e2e-team')
  await expect(pane.locator('.monaco-editor')).toHaveCount(0)

  await pane.getByRole('button', { name: 'Edit' }).click()
  await typeAtEnd(page, pane, 'yyyy')
  await page.keyboard.press('Control+s')
  await expect.poll(() => readFileSync(claudeMd, 'utf-8')).toBe(`${seeded}yyyy`)
  await expect(pane.getByRole('button', { name: 'Edit' })).toBeVisible()
  await expect(pane.locator('.monaco-editor')).toHaveCount(0)
  await expect(repo.getByRole('button', { name: /^CLAUDE\.md ~101/ })).toBeVisible()

  await repo.getByRole('button', { name: /\.claude\/settings\.json/ }).click()
  await expect(pane.locator('.monaco-editor')).toBeVisible()
  await pane.getByRole('button', { name: 'Edit' }).click()
  await typeAtEnd(page, pane, 'oops')
  await page.keyboard.press('Control+s')
  await expect(view.getByRole('status').filter({ hasText: /^Not saved\. Invalid JSON: / })).toBeVisible()
  await expect(pane.getByRole('button', { name: 'Save' })).toBeVisible()
  expect(readFileSync(settings, 'utf-8')).toBe('{}')

  await page.keyboard.press('Control+f')
  await expect(pane.locator('.find-widget.visible')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(pane.locator('.find-widget.visible')).toHaveCount(0)
  await expect(pane.getByRole('button', { name: 'Save' })).toBeVisible()

  page.once('dialog', (dialog) => void dialog.accept())
  await page.keyboard.press('Escape')
  await expect(pane.getByRole('button', { name: 'Edit' })).toBeVisible()
  expect(readFileSync(settings, 'utf-8')).toBe('{}')
})

test('Clean up → This project opens Work on a new session with the prompt waiting, and its CLI may read the memory folder', async ({ launched }) => {
  const { page, log, workspace } = launched
  const claudeMd = join(workspace, 'CLAUDE.md')
  writeFileSync(claudeMd, '# Rules\n')
  const memory = join(transcriptsOf(launched), 'memory')
  const cleanupStarts = () => log.entries().filter((e) => e.kind === 'argv' && e.cwd === workspace)

  await page.keyboard.press('Control+4')
  const layers = page.getByTestId('view-context').getByRole('region', { name: 'Context layers' })
  await layers.getByRole('button', { name: 'Clean up' }).click()
  await page.getByRole('menu', { name: 'Clean up' }).getByRole('menuitem', { name: /^This project/ }).click()

  await expect(prompt(page)).toBeVisible()
  const draft = await prompt(page).inputValue()
  expect(draft).toMatch(/^Context cleanup:/)
  expect(draft).toContain(`- ${claudeMd}\n`)

  await prompt(page).press('Enter')
  await expect.poll(() => log.userTexts().some((text) => text.startsWith('Context cleanup:'))).toBe(true)
  expect(cleanupStarts().map((e) => e.addDirs)).toEqual([[memory]])
})
