import { existsSync } from 'node:fs'
import { join } from 'node:path'
import type { ElectronApplication } from '@playwright/test'
import { OFFSCREEN_POSITION } from '../src/main/testWindow'
import { BASIC_REPLY, userLines } from './common'
import { evaluateMain, expect, newChatIn, prompt, send, startSession, test } from './harness'

test.describe('auto-update', () => {
  test.use({ script: 'slow', env: { CC_UPDATE_IDLE_MS: '1500' } })

  type Fake = { restartRequests: number; checks: number; deliver: (version: string) => void }
  /** The main process's fake updater; Playwright sends the function's source, so it must not close over anything. */
  const fakeCount = (app: ElectronApplication, key: 'restartRequests' | 'checks'): Promise<number> =>
    evaluateMain(app, (_electron, k: string) => (globalThis as unknown as { __ccFakeUpdater: Record<string, number> }).__ccFakeUpdater[k], key)
  const deliverUpdate = (app: ElectronApplication, version: string): Promise<void> =>
    evaluateMain(app, (_electron, v: string) => (globalThis as unknown as { __ccFakeUpdater: Fake }).__ccFakeUpdater.deliver(v), version)
  const restartRequests = (app: ElectronApplication): Promise<number> => fakeCount(app, 'restartRequests')

  test('Settings → General checks again on Check now; an update that arrives mid-turn waits for the chat, then restarts after the idle timer', async ({ launched }) => {
    const { app, page } = launched

    await test.step('Settings → General shows the version and the last check, and Check now checks again', async () => {
      const checks = (): Promise<number> => fakeCount(app, 'checks')
      await expect.poll(checks).toBe(1)
      await page.keyboard.press('Control+,')
      await page.getByRole('button', { name: 'General' }).click()
      const updates = page.getByRole('region', { name: 'Updates' })
      await expect(updates.getByText('Current version')).toBeVisible()
      await expect(updates.getByText(/^Last checked /)).toBeVisible()
      await updates.getByRole('button', { name: 'Check now' }).click()
      await expect.poll(checks).toBe(2)
      await page.keyboard.press('Escape')
    })

    await test.step('an update that arrives mid-turn waits for the chat; once it is idle the restart is requested after the timer', async () => {
      const pill = page.getByRole('button', { name: 'Restart to update' })
      await startSession(launched)
      await send(page, 'run the long job')
      await expect(page.getByText('Starting a long job.')).toBeVisible()
      await expect(pill).toHaveCount(0)

      await deliverUpdate(app, '9.9.9')
      await expect(pill).toBeVisible()
      await page.waitForTimeout(2500)
      expect(await restartRequests(app)).toBe(0)

      await pill.click()
      const dialog = page.getByRole('dialog', { name: 'Restart to update' })
      await expect(dialog.getByText('1 chat is working. Restart anyway?')).toBeVisible()
      await expect(dialog.getByRole('button', { name: 'Cancel' })).toBeFocused()
      await page.keyboard.press('Enter')
      await expect(dialog).toHaveCount(0)
      expect(await restartRequests(app)).toBe(0)

      await page.locator('[data-chat-pane]').getByRole('button', { name: 'Stop' }).click()
      await expect(page.getByText('Interrupted', { exact: true })).toBeVisible()
      await expect(pill).toBeVisible()
      await expect.poll(() => restartRequests(app), { timeout: 10_000 }).toBe(1)
    })
  })
})

test('zoom starts at 110% and steps per key, Ctrl+B hides the session list while Alt+1 and Ctrl+Shift+J still open rows, and both are kept across a restart', async ({ launched }) => {
  const { app, page, log } = launched
  const zoomPercent = (electronApp: ElectronApplication): Promise<number> =>
    evaluateMain(electronApp, ({ BrowserWindow }) => Math.round(BrowserWindow.getAllWindows()[0].webContents.getZoomFactor() * 100), null)
  const list = page.getByRole('navigation', { name: 'Sessions' })
  const show = page.getByRole('button', { name: 'Show sessions' })

  await test.step('starts at 110%, steps one level per key from the prompt box, resets with Ctrl+0', async () => {
    await expect.poll(() => zoomPercent(app)).toBe(110)
    await startSession(launched)
    await prompt(page).focus()
    await page.keyboard.press('Control+=')
    await expect.poll(() => zoomPercent(app)).toBe(132)
    await page.keyboard.press('Control+-')
    await page.keyboard.press('Control+-')
    await expect.poll(() => zoomPercent(app)).toBe(92)
    await expect(prompt(page)).toHaveValue('')
    await page.keyboard.press('Control+0')
    await expect.poll(() => zoomPercent(app)).toBe(110)
  })

  await test.step('Ctrl+B hides and shows the session list, and Alt+1 and Ctrl+Shift+J still open rows while it is hidden', async () => {
    await send(page, 'say hello')
    await expect(page.getByText(BASIC_REPLY)).toBeVisible()
    await expect(list).toBeVisible()

    await page.keyboard.press('Control+b')
    await expect(list).toBeHidden()
    await expect(show).toBeVisible()
    const reply = page.locator('[data-chat-pane]').getByText(BASIC_REPLY)
    const openAnother = async () => {
      await page.keyboard.press('Control+t')
      await newChatIn(page, /e2e-workspace/)
      await expect(reply).toBeHidden()
    }
    await openAnother()
    await page.keyboard.press('Alt+1')
    await expect(reply).toBeVisible()
    await openAnother()
    await page.keyboard.press('Control+Shift+J')
    await expect(reply).toBeVisible()

    await show.click()
    await expect(list).toBeVisible()
  })

  await test.step('a shell steps the zoom and takes Ctrl+B too; Settings → General steps it', async () => {
    await page.keyboard.press('Control+`')
    const terminal = page.locator('.xterm-helper-textarea').first()
    await expect(terminal).toBeAttached()
    await terminal.focus()
    await page.keyboard.press('Control+=')
    await expect.poll(() => zoomPercent(app)).toBe(132)
    await page.keyboard.press('Control+b')
    await expect(list).toBeHidden()
    await page.keyboard.press('Control+b')
    await expect(list).toBeVisible()

    await page.keyboard.press('Control+,')
    await page.getByRole('navigation', { name: 'Settings sections' }).getByText('General', { exact: true }).click()
    await expect(page.getByText('132%')).toBeVisible()
    await page.getByRole('button', { name: 'Zoom in' }).click()
    await expect(page.getByText('158%')).toBeVisible()
    await page.getByRole('button', { name: 'Zoom out' }).click()
    await expect(page.getByText('132%')).toBeVisible()
  })

  await test.step('Hide sessions hides the list', async () => {
    await page.keyboard.press('Control+2')
    await list.getByRole('button', { name: 'Hide sessions' }).click()
    await expect(list).toBeHidden()
  })

  await test.step('after a restart the zoom and the hidden list are kept, and the View menu steps the saved level', async () => {
    await evaluateMain(app, ({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setPosition(-31000, -31000), null)
    const again = await launched.relaunch()
    await expect.poll(() => zoomPercent(again.app)).toBe(132)
    expect(existsSync(join(launched.root, 'user-data', 'window-place.json')), 'test windows never save their place').toBe(false)
    expect(await evaluateMain(again.app, ({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].getBounds().x, null)).toBe(OFFSCREEN_POSITION.x)
    await again.page.keyboard.press('Control+2')
    await expect(again.page.getByRole('button', { name: 'Show sessions' })).toBeVisible()
    await expect(again.page.getByRole('navigation', { name: 'Sessions' })).toBeHidden()
    await again.page.keyboard.press('Control+b')
    await expect(again.page.getByRole('navigation', { name: 'Sessions' })).toBeVisible()
    expect(userLines(log).length).toBe(1)

    const clickViewMenu = (label: string) =>
      evaluateMain(again.app, ({ Menu }, name: string) => {
        const view = Menu.getApplicationMenu()?.items.find((i) => i.label === 'View')
        view?.submenu?.items.find((i) => i.label === name)?.click()
      }, label)
    await clickViewMenu('Zoom Out')
    await expect.poll(() => zoomPercent(again.app)).toBe(110)
    await clickViewMenu('Zoom In')
    await expect.poll(() => zoomPercent(again.app)).toBe(132)
    await clickViewMenu('Actual Size')
    await expect.poll(() => zoomPercent(again.app)).toBe(110)
  })
})
