import { execFileSync } from 'node:child_process'
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

const externalOpens = (app: ElectronApplication): Promise<string[]> =>
  evaluateMain(app, () => (globalThis as unknown as { __ccOpened?: string[] }).__ccOpened ?? [], null)

test.describe('background processes', () => {
  test.use({ script: 'processes' })

  test('the Processes tab counts a background server, lists it Running with its command and output, opens its port, badges the session row, and Stop turns it Stopped', async ({ launched }) => {
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
