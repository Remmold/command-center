import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test } from './harness'

// A browser global of the functions that run inside the page; this project compiles against Node's types.
declare const window: { innerWidth: number }

test.use({ userSettings: { model: 'sonnet', someKeyThePageDoesNotKnow: { keep: [1, 2] } } })

test('Claude Code settings: a Model & thinking change and one found by search wait in the save bar, and Save writes only that key into the account’s file; a change from outside then shows', async ({ launched }) => {
  const { app, page, configDir } = launched
  const file = join(configDir, 'settings.json')

  await page.getByRole('button', { name: 'Settings', exact: true }).click()
  await page.getByRole('navigation', { name: 'Settings sections' }).getByText('Claude Code', { exact: true }).click()
  const model = page.getByRole('group', { name: 'Model', exact: true }).getByRole('combobox', { name: 'Model' })
  await expect(model).toHaveValue('sonnet')

  await model.selectOption('opus')
  await page.getByRole('navigation', { name: 'Claude Code categories' }).getByText('Interface', { exact: true }).click()
  await expect(page.getByRole('group', { name: 'Extended thinking', exact: true })).toBeHidden()
  const search = page.getByRole('searchbox', { name: 'Search settings' })
  await search.fill('alwaysThinkingEnabled')
  await expect(page.getByRole('region', { name: 'Model & thinking' }).getByRole('group')).toHaveCount(1)
  await search.fill('extended thinking')
  await page.getByRole('group', { name: 'Extended thinking', exact: true }).getByRole('checkbox', { name: 'On' }).check()
  await page.getByRole('navigation', { name: 'Claude Code categories' }).getByText('Model & thinking', { exact: true }).click()
  const bar = page.getByRole('region', { name: 'Unsaved Claude Code changes' })
  await expect(bar).toContainText('2 changes')

  await bar.getByRole('button', { name: 'Review' }).click()
  await expect(page.getByRole('dialog', { name: 'Review changes' })).toContainText('Sonnet → Opus')
  await page.getByRole('dialog', { name: 'Review changes' }).getByRole('button', { name: 'Back' }).click()

  await bar.getByRole('button', { name: 'Save' }).click()
  await expect(bar).toBeHidden()
  expect(JSON.parse(readFileSync(file, 'utf-8'))).toEqual({ model: 'opus', someKeyThePageDoesNotKnow: { keep: [1, 2] }, alwaysThinkingEnabled: true })

  writeFileSync(file, JSON.stringify({ model: 'haiku', someKeyThePageDoesNotKnow: { keep: [1, 2] }, alwaysThinkingEnabled: true }, null, 2) + '\n')
  await expect(model).toHaveValue('haiku')
  await expect(bar).toBeHidden()

  // Key bindings: a chord set by pressing it lands in the account's keybindings.json, made on first Save.
  await page.getByRole('navigation', { name: 'Claude Code categories' }).getByText('Key bindings', { exact: true }).click()
  await page.getByRole('button', { name: 'Add a key to Edit the prompt in your editor' }).click()
  await page.keyboard.press('Control+c')
  await expect(page.getByRole('alert')).toContainText('Ctrl+C')
  await page.getByRole('button', { name: 'Again', exact: true }).click()
  await page.keyboard.press('Control+k')
  await page.keyboard.press('Enter')
  await page.keyboard.press('Control+e')
  // Keyboard only: one keystroke per recording, so Tab then leaves the box.
  await page.keyboard.press('Tab')
  await expect(page.getByRole('button', { name: 'Use', exact: true })).toBeFocused()
  await page.keyboard.press('Enter')

  // A key-binding change and a settings change found by the page-wide search wait in one save bar, and Save writes both files.
  await search.fill('extended thinking')
  await page.getByRole('group', { name: 'Extended thinking', exact: true }).getByRole('checkbox', { name: 'On' }).uncheck()
  await expect(bar).toContainText('2 changes')
  await bar.getByRole('button', { name: 'Save' }).click()
  await expect(bar).toBeHidden()
  expect(JSON.parse(readFileSync(join(configDir, 'keybindings.json'), 'utf-8')).bindings).toEqual([{ context: 'Chat', bindings: { 'ctrl+k ctrl+e': 'chat:externalEditor' } }])
  expect(JSON.parse(readFileSync(file, 'utf-8')).alwaysThinkingEnabled).toBe(false)
  await page.getByRole('navigation', { name: 'Claude Code categories' }).getByText('Model & thinking', { exact: true }).click()

  // In a narrow window the toolbar and each row's control wrap rather than run under the layer bar or off the right.
  await app.evaluate(({ BrowserWindow }) => {
    const win = BrowserWindow.getAllWindows()[0]
    win.unmaximize()
    win.setContentSize(700, 800)
  })
  await expect.poll(() => page.evaluate(() => window.innerWidth)).toBeLessThan(700)
  const right = await page.evaluate(() => window.innerWidth)
  const layerBar = await page.getByRole('tablist', { name: 'Layer' }).boundingBox()
  const searchBox = await search.boundingBox()
  const modelBox = await model.boundingBox()
  expect(layerBar && searchBox && (searchBox.y >= layerBar.y + layerBar.height || searchBox.x >= layerBar.x + layerBar.width)).toBe(true)
  expect(searchBox && searchBox.x + searchBox.width).toBeLessThanOrEqual(right)
  expect(modelBox && modelBox.x + modelBox.width).toBeLessThanOrEqual(right)
})
