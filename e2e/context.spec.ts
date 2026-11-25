import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, sep } from 'node:path'
import type { Locator, Page } from '@playwright/test'
import { expect, test, transcriptsOf, useScript } from './harness'

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

test('Map tour: step 5 shows the seeded MEMORY.md finding, step 6 starts a drift check whose finding lands on its block while Context stays, ticking it and Apply sends its id to the run session, and Open chat shows the run in Work', async ({ launched }) => {
  const { app, page, log, workspace, root } = launched
  const claudeMd = join(workspace, 'CLAUDE.md')
  writeFileSync(claudeMd, '# Rules\n')
  const memory = join(transcriptsOf(launched), 'memory')
  mkdirSync(memory, { recursive: true })
  writeFileSync(join(memory, 'MEMORY.md'), Array.from({ length: 205 }, (_, i) => `- line ${i + 1}\n`).join(''))
  await useScript(app, 'driftCheck')
  const runs = join(root, 'user-data', 'drift-checks')
  const starts = () => log.entries().filter((e) => e.kind === 'argv' && e.cwd === workspace)

  await page.keyboard.press('Control+4')
  const view = page.getByTestId('view-context')
  await view.getByRole('tablist', { name: 'Context pane' }).getByRole('tab', { name: 'Map' }).click()
  const tour = view.getByRole('region', { name: 'Guided tour' })
  for (let step = 1; step < 5; step++) await tour.getByRole('button', { name: 'Next' }).click()
  await expect(tour.getByRole('button', { name: /^MEMORY\.md is 205 lines, but Claude loads only the first 200 lines/ })).toBeVisible()

  await tour.getByRole('button', { name: 'Next' }).click()
  await tour.getByRole('list', { name: 'What to check' }).getByRole('button', { name: /^This project/ }).click()
  await tour.getByRole('button', { name: 'Start', exact: true }).click()

  await expect.poll(() => log.userTexts().some((text) => text.startsWith('Drift check:'))).toBe(true)
  const sent = log.userTexts().find((text) => text.startsWith('Drift check:')) ?? ''
  expect(sent).toContain(`- ${claudeMd}\n`)
  expect(sent).toMatch(/^Findings file: .+\.json$/m)
  expect(sent).toContain(`Findings file: ${runs}${sep}`)
  expect(starts().map((e) => e.addDirs)).toEqual([[memory, runs]])
  await expect(view).toBeVisible()

  const map = view.getByRole('region', { name: 'Context map' })
  await expect(map.getByRole('region', { name: 'Repo · Every start' }).getByRole('button', { name: /^CLAUDE\.md.*1 finding/ })).toBeVisible()
  await expect(map.getByRole('region', { name: /^Drift check / })).toContainText('e2e-workspace files')

  await map.getByRole('region', { name: 'Repo · Every start' }).getByRole('button', { name: /^CLAUDE\.md.*1 finding/ }).click()
  const detail = view.getByRole('region', { name: 'Block detail' })
  await detail.getByRole('checkbox', { name: 'Fix F1' }).check()
  await map.getByRole('button', { name: 'Apply 1 fix' }).click()
  await expect.poll(() => log.userTexts().find((text) => text.startsWith('Fix findings:')) ?? '').toMatch(/^Findings file: .+\.json\nIds: F1$/m)
  await expect(detail.getByText('applied', { exact: true })).toBeVisible()
  await expect(detail.getByRole('checkbox', { name: 'Fix F1' })).toHaveCount(0)
  await expect(map.getByRole('region', { name: 'Repo · Every start' }).getByRole('button', { name: /^CLAUDE\.md.*1 applied or skipped/ })).toBeVisible()

  await map.getByRole('button', { name: 'Open chat' }).click()
  await expect(page.getByTestId('view-work').getByText('Recorded one finding in the findings file.')).toBeVisible()
})
