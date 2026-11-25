import { execFileSync } from 'node:child_process'
import { expect, send, startSession, test } from './harness'

test.describe('background processes', () => {
  test.use({ script: 'processes' })

  test('the Processes tab counts a background server, lists it Running with its command, and Stop turns it Stopped', async ({ launched }) => {
    const { page, log } = launched
    const pane = page.locator('[data-chat-pane]')
    const strip = pane.locator('[data-tab-strip]')
    const processesTab = strip.getByRole('tab', { name: /^Processes/ })
    const rows = pane.getByRole('list', { name: 'Background processes' }).getByRole('listitem')
    try {
      await startSession(launched)
      await processesTab.click()
      await expect(pane.getByRole('tabpanel', { name: 'Processes' })).toHaveText('No background processes are running.')

      await send(page, 'start the server')
      await expect(processesTab).toHaveAccessibleName('Processes 1')
      await expect(rows).toHaveCount(1)
      await expect(rows.locator('[data-process-status]')).toHaveText('Running')
      await expect(rows.locator('[data-process-command]')).toHaveText('pnpm dev --port 0')

      await rows.getByRole('button', { name: 'Stop' }).click()
      await expect(rows.locator('[data-process-status]')).toHaveText('Stopped')
      await expect(rows.getByRole('button', { name: 'Stop' })).toHaveCount(0)
      await expect(processesTab).toHaveAccessibleName('Processes')
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
