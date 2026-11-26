import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test } from './harness'

test.use({ userSettings: { model: 'sonnet', someKeyThePageDoesNotKnow: { keep: [1, 2] } } })

test('Claude Code settings: a Model & thinking change waits in the save bar, and Save writes only that key into the account’s file', async ({ launched }) => {
  const { page, configDir } = launched
  const file = join(configDir, 'settings.json')

  await page.getByRole('button', { name: 'Settings', exact: true }).click()
  await page.getByRole('navigation', { name: 'Settings sections' }).getByText('Claude Code', { exact: true }).click()
  const model = page.getByRole('group', { name: 'Model', exact: true }).getByRole('combobox', { name: 'Model' })
  await expect(model).toHaveValue('sonnet')

  await model.selectOption('opus')
  await page.getByRole('group', { name: 'Effort', exact: true }).getByRole('combobox', { name: 'Effort' }).selectOption('high')
  const bar = page.getByRole('region', { name: 'Unsaved Claude Code changes' })
  await expect(bar).toContainText('2 changes')

  await bar.getByRole('button', { name: 'Review' }).click()
  await expect(page.getByRole('dialog', { name: 'Review changes' })).toContainText('Sonnet → Opus')
  await page.getByRole('dialog', { name: 'Review changes' }).getByRole('button', { name: 'Back' }).click()

  await bar.getByRole('button', { name: 'Save' }).click()
  await expect(bar).toBeHidden()
  expect(JSON.parse(readFileSync(file, 'utf-8'))).toEqual({ model: 'opus', someKeyThePageDoesNotKnow: { keep: [1, 2] }, effortLevel: 'high' })
})
