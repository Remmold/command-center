import { renameSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Model3dRequest } from '../src/shared/model3d'
import { expect, model3dView, test, titleBar, type Model3dFakes } from './harness'

/** Drops a request as gen3d.py would, for the fake worker; it runs until `hold` exists. */
function dropRequest(fakes: Model3dFakes, workspace: string, name: string, submittedAt: string): { id: string; hold: string } {
  const id = `e2e-${name}`
  const hold = join(workspace, `${name}.release`)
  const request: Model3dRequest = {
    id,
    kind: 'generate',
    argv: ['--image', `${name}.png`, '--name', name, '--out', join(workspace, 'generated3d'), '--comfy-port', String(fakes.port), '--hold', hold],
    cwd: workspace,
    python: 'python',
    script: fakes.worker,
    waiterPid: process.pid,
    wait: true,
    sessionId: '',
    configDir: '',
    submittedAt,
    summary: `${name}.png · prop`,
    runAnyway: false
  }
  const file = join(fakes.jobs, `${id}.request.json`)
  writeFileSync(`${file}.tmp`, JSON.stringify(request))
  renameSync(`${file}.tmp`, file)
  return { id, hold }
}

test('the 3D view on Ctrl+6: a dropped request goes queued, running with progress, then done, newest first, with who asked; Stop server stops the app-started server', async ({ launched }) => {
  const { page, workspace, model3d } = launched
  const view = model3dView(page)
  const jobs = view.getByRole('list', { name: '3D jobs' }).getByRole('listitem')
  const job = (name: string) => jobs.filter({ hasText: new RegExp(`^${name}\\.png · prop`) })
  const stop = view.getByRole('button', { name: 'Stop server' })

  await page.keyboard.press('Control+6')
  await expect(titleBar(page).getByRole('tab', { name: '3D', exact: true })).toHaveAttribute('aria-selected', 'true')
  await expect(view.getByText('No 3D jobs yet.')).toBeVisible()
  await expect(view.getByText('Stopped', { exact: true })).toBeVisible()
  await expect(stop).toBeDisabled()

  const crate = dropRequest(model3d, workspace, 'crate', '2026-11-28T10:00:00.000Z')
  await expect(job('crate')).toContainText('Running')
  await expect(job('crate')).toContainText(/Item 1 of 1 · crate · generate · step \d+\/12/)
  await expect(job('crate')).toContainText('Outside the app · e2e-workspace · e2e-workspace · Personal')
  await expect(view.getByText('Ready', { exact: true })).toBeVisible()
  await expect(stop).toBeDisabled()

  const barrel = dropRequest(model3d, workspace, 'barrel', '2026-11-28T10:00:01.000Z')
  await expect(job('barrel')).toContainText('Queued')
  await expect(job('barrel')).toContainText('Waiting: crate.png · prop running')
  await expect(jobs).toHaveText([/barrel/, /crate/])

  writeFileSync(crate.hold, '')
  await expect(job('crate')).toContainText('Done')
  await expect(job('barrel')).toContainText('Running')
  writeFileSync(barrel.hold, '')
  await expect(job('barrel')).toContainText('Done')

  await expect(stop).toBeEnabled()
  await stop.click()
  await expect(view.getByText('Stopped', { exact: true })).toBeVisible()
  await expect(stop).toBeDisabled()
})
