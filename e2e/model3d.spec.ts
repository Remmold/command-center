import { spawn } from 'node:child_process'
import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Model3dRequest } from '../src/shared/model3d'
import { expect, model3dView, test, titleBar, type Model3dFakes } from './harness'

/** Drops a request as gen3d.py would, for the fake worker; it runs until `hold` exists. */
function dropRequest(fakes: Model3dFakes, workspace: string, name: string, submittedAt: string, held = true): { id: string; hold: string } {
  const id = `e2e-${name}`
  const hold = join(workspace, `${name}.release`)
  const request: Model3dRequest = {
    id,
    kind: 'generate',
    argv: ['--image', `${name}.png`, '--name', name, '--out', join(workspace, 'generated3d'), '--comfy-port', String(fakes.port), ...(held ? ['--hold', hold] : [])],
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

test('the 3D view on Ctrl+6: a dropped request goes queued, running with progress, then done, newest first, with who asked; its model opens in the viewer with stats and sheet, as does one from Open model…; Stop server stops the app-started server at once, and one started outside the app after a confirm', async ({ launched }) => {
  const { app, page, workspace, model3d } = launched
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
  await expect(job('crate')).toContainText('Outside the app · e2e-workspace · Personal')
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

  const viewer = view.getByRole('region', { name: 'Model viewer' })
  await job('crate').getByRole('list', { name: 'Models' }).getByRole('button', { name: 'crate.glb' }).click()
  const canvas = viewer.getByLabel('3D model crate')
  await expect(canvas).toHaveAttribute('data-state', 'shown')
  await expect(viewer.getByText('WebGL is not available', { exact: false })).toHaveCount(0)
  const stats = viewer.getByRole('group', { name: 'Model stats' })
  await expect(stats).toContainText('Triangles1')
  await expect(stats).toContainText('Textures1x1')
  await expect(stats).toContainText('Presetprop')
  const sheet = viewer.getByRole('img', { name: 'crate_sheet.png' })
  await expect.poll(() => sheet.evaluate((img) => (img as unknown as { naturalWidth: number }).naturalWidth)).toBeGreaterThan(0)
  const lit = await canvas.screenshot()
  await viewer.getByRole('button', { name: 'Wireframe' }).click()
  await expect.poll(async () => (await canvas.screenshot()).equals(lit)).toBe(false)
  await viewer.getByRole('button', { name: 'Wireframe' }).click()
  await expect.poll(async () => (await canvas.screenshot()).equals(lit)).toBe(true)
  await viewer.getByRole('tab', { name: 'Unlit' }).click()
  await expect.poll(async () => (await canvas.screenshot()).equals(lit)).toBe(false)

  await app.evaluate(({ dialog }, picked) => {
    dialog.showOpenDialog = (async () => ({ canceled: false, filePaths: [picked] })) as typeof dialog.showOpenDialog
  }, join(workspace, 'generated3d', 'barrel.glb'))
  await viewer.getByRole('button', { name: 'Open model…' }).click()
  await expect(viewer.getByLabel('3D model barrel')).toHaveAttribute('data-state', 'shown')
  await expect(viewer.getByRole('img', { name: 'barrel_sheet.png' })).toBeVisible()

  await expect(stop).toBeEnabled()
  await stop.click()
  await expect(view.getByText('Stopped', { exact: true })).toBeVisible()
  await expect(stop).toBeDisabled()

  const outside = spawn('python', ['main.py', '--port', String(model3d.port)], { cwd: model3d.engineDir, stdio: 'ignore', windowsHide: true })
  const ended = new Promise<void>((resolve) => outside.once('exit', () => resolve()))
  try {
    const answers = () => fetch(`http://127.0.0.1:${model3d.port}/system_stats`).then((r) => r.ok, () => false)
    await expect.poll(answers).toBe(true)
    dropRequest(model3d, workspace, 'lamp', '2026-11-28T10:00:02.000Z', false)
    await expect(job('lamp')).toContainText('Done')
    await expect(view.getByText('Ready · Started outside the app', { exact: true })).toBeVisible()
    await stop.click()
    const confirm = page.getByRole('dialog', { name: 'Stop server' })
    await expect(confirm).toContainText('started outside Command Center')
    await confirm.getByRole('button', { name: 'Stop it' }).click()
    await expect(view.getByText('Stopped', { exact: true })).toBeVisible()
    await ended
  } finally {
    outside.kill()
  }
})

test('a job held by another job’s gpu claim waits with that reason and Cancel ends it; Run anyway skips the claim, and Cancel on the running job interrupts ComfyUI; Open editor takes the turn and opens the editor URL, Done with editor ends it', async ({ launched }) => {
  const { page, workspace, model3d } = launched
  const view = model3dView(page)
  const job = (name: string) => view.getByRole('list', { name: '3D jobs' }).getByRole('listitem').filter({ hasText: new RegExp(`^${name}\\.png · prop`) })
  // Recent: the app counts a gpu claim older than coord.py's 180 min as void.
  const at = `${new Date(Date.now() - 5 * 60_000).toISOString().slice(0, 19)}Z`
  writeFileSync(model3d.coordBoard, JSON.stringify([{ job: 'boss2', path: 'gpu', why: 'bake', at: at.replace('T', ' ') }]))
  const waiting = `Waiting: gpu claimed by boss2 since ${new Date(Date.parse(at)).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`

  await page.keyboard.press('Control+6')
  dropRequest(model3d, workspace, 'statue', '2026-11-28T10:00:00.000Z')
  await expect(job('statue')).toContainText(waiting)
  await job('statue').getByRole('button', { name: 'Cancel' }).click()
  await expect(job('statue')).toContainText('Cancelled in Command Center')
  await expect(job('statue').getByRole('button')).toHaveCount(0)
  await expect(view.getByText('Stopped', { exact: true })).toBeVisible()

  dropRequest(model3d, workspace, 'idol', '2026-11-28T10:00:01.000Z')
  await expect(job('idol')).toContainText(waiting)
  await job('idol').getByRole('button', { name: 'Run anyway' }).click()
  await expect(job('idol')).toContainText(/Item 1 of 1 · idol · generate · step \d+\/12/)
  await job('idol').getByRole('button', { name: 'Cancel' }).click()
  await expect(job('idol')).toContainText('Cancelled in Command Center')
  await expect(view.getByRole('button', { name: 'Stop server' })).toBeEnabled()
  const posts = (): string[] => readFileSync(join(model3d.engineDir, 'calls.log'), 'utf8').split(/\r?\n/)
  await expect.poll(posts).toEqual(expect.arrayContaining(['/interrupt', '/queue']))

  writeFileSync(model3d.coordBoard, '[]')
  const editor = view.getByRole('list', { name: '3D jobs' }).getByRole('listitem').filter({ hasText: /^Editor turn/ })
  await view.getByRole('button', { name: 'Open editor' }).click()
  await expect(editor).toContainText('Running')
  await expect(editor).toContainText('Command Center')
  const opened = (): string => (existsSync(model3d.browserLog) ? readFileSync(model3d.browserLog, 'utf8') : '')
  await expect.poll(opened).toBe(`http://127.0.0.1:${model3d.port}\n`)
  await expect(view.getByRole('button', { name: 'Stop server' })).toBeDisabled()
  await view.getByRole('button', { name: 'Done with editor' }).click()
  await expect(editor).toContainText('Done')
  await expect(view.getByRole('button', { name: 'Open editor' })).toBeEnabled()
})
