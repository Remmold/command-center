import { execFileSync } from 'node:child_process'
import { connect } from 'node:net'
import type { ElectronApplication } from '@playwright/test'
import { evaluateMain, expect, send, startSession, test } from './harness'

/** Swaps the main process's `shell.openExternal` for a recorder, so no browser opens. */
async function recordExternalOpens(app: ElectronApplication): Promise<void> {
  await evaluateMain(app, ({ shell }) => {
    const opened = ((globalThis as unknown as { __ccOpened?: string[] }).__ccOpened ??= [])
    shell.openExternal = async (url: string) => {
      opened.push(url)
    }
  }, null)
}

function portAnswers(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = connect(port, '127.0.0.1')
    socket.setTimeout(500)
    socket.once('connect', () => (socket.destroy(), resolve(true)))
    socket.once('error', () => resolve(false))
    socket.once('timeout', () => (socket.destroy(), resolve(false)))
  })
}

const externalOpens = (app: ElectronApplication): Promise<string[]> =>
  evaluateMain(app, () => (globalThis as unknown as { __ccOpened?: string[] }).__ccOpened ?? [], null)

test.describe('background processes', () => {
  test.use({ script: 'processes' })

  test('the Processes tab counts a background server, lists it Running with its command and output, opens its port, badges the session row, Stop turns it Stopped, and closing the session ends a server left running', async ({ launched }) => {
    const { app, page, log } = launched
    const pane = page.locator('[data-chat-pane]')
    const strip = pane.locator('[data-tab-strip]')
    const processesTab = strip.getByRole('tab', { name: /^Processes/ })
    const rows = pane.getByRole('list', { name: 'Background processes' }).getByRole('listitem')
    const output = rows.getByLabel('Output of pnpm dev --port 0')
    const chatTab = strip.getByRole('tab', { name: 'Chat' })
    const sessions = page.getByRole('navigation', { name: 'Sessions' })
    const badge = sessions.getByRole('img', { name: '1 background process running' })
    try {
      await recordExternalOpens(app)
      await startSession(launched)
      await processesTab.click()
      await expect(pane.getByRole('tabpanel', { name: 'Processes' })).toHaveText('No background processes are running.')

      await send(page, 'start the server')
      await expect(processesTab).toHaveAccessibleName('Processes 1')
      await expect(rows).toHaveCount(1)
      await expect(badge).toHaveText('1')
      await expect(rows.locator('[data-process-status]')).toHaveText('Running')
      await expect(rows.locator('[data-process-command]')).toHaveText('pnpm dev --port 0')
      await expect(output).toHaveText(/^Listening on http:\/\/localhost:\d+$/)
      const url = /http:\/\/localhost:\d+/.exec((await output.textContent()) ?? '')?.[0] ?? ''
      const open = rows.getByRole('button', { name: `Open ${url}` })
      await expect(badge).toHaveAttribute('title', `pnpm dev --port 0 :${new URL(url).port}`)
      await open.click()
      await expect.poll(() => externalOpens(app)).toEqual([url])

      await chatTab.click()
      await page.waitForTimeout(500)
      const asked = log.controlRequests('get_task_output').length
      await page.waitForTimeout(1500)
      expect(log.controlRequests('get_task_output')).toHaveLength(asked)
      await processesTab.click()

      await rows.getByRole('button', { name: 'Stop' }).click()
      await expect(rows.locator('[data-process-status]')).toHaveText('Stopped')
      await expect(rows.getByRole('button', { name: 'Stop' })).toHaveCount(0)
      await expect(processesTab).toHaveAccessibleName('Processes')
      await expect(badge).toHaveCount(0)
      await expect(output).toHaveText(/\[killed\]$/)
      await expect(rows.getByRole('button', { name: /^Open / })).toHaveCount(0)
      expect(log.controlRequests('stop_task')).toHaveLength(1)

      await send(page, 'start the server')
      const running = rows.filter({ has: page.locator('[data-process-status]', { hasText: 'Running' }) })
      const runningOutput = running.getByLabel('Output of pnpm dev --port 0')
      await expect(runningOutput).toHaveText(/^Listening on http:\/\/localhost:\d+$/)
      const port = Number(/localhost:(\d+)/.exec((await runningOutput.textContent()) ?? '')?.[1])
      expect(await portAnswers(port)).toBe(true)
      await sessions.getByRole('button', { name: 'Session actions' }).click()
      await page.getByRole('menuitem', { name: /^Close/ }).click()
      await expect.poll(() => portAnswers(port)).toBe(false)
    } finally {
      for (const pid of log.spawnedPids()) {
        try {
          execFileSync('taskkill', ['/PID', String(pid), '/T', '/F'], { stdio: 'ignore' })
        } catch {
          // Already ended by Stop.
        }
      }
    }
  })
})

test.describe('terminals in the Processes view', () => {
  test('New terminal runs a command that stays alive and opens a plain shell that echoes typing; renamed, it shows in the Shell drawer, leaves it on closing the tab, and Close ends it', async ({ launched }) => {
    const { page } = launched
    const group = page.getByRole('list', { name: /e2e-workspace/ })
    const row = (name: string) => group.getByRole('button').filter({ hasText: name })
    const newTerminal = async (command: string): Promise<void> => {
      await page.getByRole('button', { name: 'New terminal' }).click()
      await page.getByRole('option', { name: /e2e-workspace/ }).click()
      if (command) await page.getByRole('combobox', { name: 'New terminal' }).fill(command)
      await page.keyboard.press('Enter')
    }
    await page.keyboard.press('Control+5')

    await newTerminal("Write-Output ('cc-' + 'ready'); Start-Sleep -Seconds 600")
    const server = page.getByRole('region', { name: /^Write-Output/ })
    await expect(server.locator('.xterm-rows')).toContainText('cc-ready')
    await expect(row('Write-Output')).toContainText('Running · You')

    await newTerminal('')
    const shell = page.getByRole('region', { name: 'pwsh' })
    await expect(shell.getByRole('button', { name: 'Restart' })).toHaveCount(0)
    await shell.locator('.xterm-helper-textarea').focus()
    await page.keyboard.type("echo ('cc-' + 'typed')")
    await page.keyboard.press('Enter')
    await expect(shell.locator('.xterm-rows')).toContainText(')cc-typed')

    await shell.getByRole('button', { name: 'Rename' }).click()
    await page.getByRole('textbox', { name: 'Terminal name' }).fill('my shell')
    await page.keyboard.press('Enter')
    const mine = page.getByRole('region', { name: 'my shell' })
    await expect(row('my shell')).toBeVisible()

    await mine.getByRole('button', { name: 'Open in Shell drawer' }).click()
    const drawer = page.locator('.xterm-rows:visible')
    await expect(drawer).toHaveCount(1)
    await expect(drawer).toContainText(')cc-typed')
    await page.getByTitle('close all tabs (the terminals keep running)').click()
    await expect(page.locator('.xterm-rows:visible')).toHaveCount(0)

    await page.keyboard.press('Control+5')
    await row('my shell').click()
    await mine.getByRole('button', { name: 'Close', exact: true }).click()
    await page.getByRole('dialog', { name: 'Close terminal' }).getByRole('button', { name: 'Close it' }).click()
    await expect(row('my shell')).toHaveCount(0)
    await expect(row('Write-Output')).toBeVisible()
  })
})
