import { mkdirSync, rmSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { _electron, expect, test, type ElectronApplication, type Page } from '@playwright/test'
import { model3dView, processesView, sessionList, shutdown } from '../harness'
import { captureWindow, shootSizes } from './capture'
import { env, neutralRoot, resize, seed, seed3dJobs, seedContext, seedFeatures, startIn } from './seed'

/**
 * Screenshots of Work with the main chat and the feature cockpit, the Test pair, Context, Processes and 3D on the
 * seeded fake repos, for judging the look. The 3D view shows seeded finished jobs only: no engine or worker runs.
 * Run: `pnpm build`, then `pnpm exec playwright test -c e2e/shots/playwright.config.ts views`.
 * SHOTS_PREFIX (default `shot`) names the files; SHOTS_DIR (default `.scratch/polish/shots/`) holds them.
 */

const REPO = resolve(__dirname, '..', '..')
const MAIN = join(REPO, 'out', 'main', 'index.js')
const ELECTRON = require('electron') as unknown as string
const OUT = process.env.SHOTS_DIR ?? join(REPO, '.scratch', 'polish', 'shots')
const PREFIX = process.env.SHOTS_PREFIX ?? 'shot'

const shoot = (app: ElectronApplication, page: Page, name: string): Promise<void> => shootSizes(app, page, OUT, PREFIX, name)

/** One of the app's other windows, once its url matches; shot at its own size. */
async function shootWindow(app: ElectronApplication, match: (url: string) => boolean, name: string, ready: (page: Page) => Promise<void>): Promise<void> {
  await expect.poll(() => app.windows().some((w) => match(w.url()))).toBe(true)
  const page = app.windows().find((w) => match(w.url()))!
  await ready(page)
  await page.waitForTimeout(600)
  const [width] = await (await app.browserWindow(page)).evaluate((win) => win.getContentSize())
  await captureWindow(app, page, join(OUT, `${PREFIX}-${name}-${width}.png`))
}

test('work with the main chat, features, context, processes and 3D screenshots', async () => {
  const root = neutralRoot('cc-shots-')
  const seeded = seed(root)
  seedFeatures(seeded)
  seed3dJobs(seeded)
  seedContext(seeded)
  mkdirSync(OUT, { recursive: true })
  const app = await _electron.launch({
    executablePath: ELECTRON,
    args: [MAIN, `--user-data-dir=${seeded.userData}`],
    cwd: REPO,
    env: env(seeded, join(root, 'fake.log'))
  })
  try {
    const page = await app.firstWindow()
    await page.waitForLoadState('domcontentloaded')
    await resize(app, 1440, 900)
    await startIn(page, 'atlas-api · auth', 'build the key rotation', 'Refreshing the token store')
    await startIn(page, 'ledger-web', 'run the onboarding tests', 'Ran the onboarding suite')

    await page.keyboard.press('Control+2')
    const list = sessionList(page)
    await list.getByRole('button', { name: /Main chat/ }).click()
    await expect(page.locator('[data-chat-pane]:visible').getByText('Here is where things stand')).toBeVisible()
    const features = list.getByRole('region', { name: 'Features' })
    const row = (name: string) => features.getByRole('listitem').filter({ has: page.getByRole('button', { name: new RegExp(name) }) })
    await expect(row('audit-log')).toContainText('Testing · 2/2 · 1 waiting')
    await expect(row('invoice-search')).toContainText('Building · 1/3')
    await expect(row('offline-mode')).toContainText('Tickets · 0/3')
    await expect(row('batch-export')).toContainText('Spec')
    await expect(row('webhook-retries')).toContainText('Grilling')
    await shoot(app, page, 'work-main-chat')

    await features.getByRole('button', { name: 'Completed' }).click()
    await expect(row('color-profiles')).toContainText('Completed')
    await row('audit-log').hover()
    await expect(row('audit-log').getByRole('button', { name: 'Test', exact: true })).toBeVisible()
    await shoot(app, page, 'work-features')

    await page.keyboard.press('Control+4')
    const context = page.getByTestId('view-context')
    await context.getByRole('navigation', { name: 'Workspaces' }).getByRole('button', { name: /^atlas-api(?!-)/ }).click()
    await context.getByRole('region', { name: 'Repo' }).getByRole('button', { name: /^CLAUDE\.md ~/ }).click()
    await expect(context.getByRole('region', { name: 'Context editor' }).getByRole('heading', { name: 'atlas-api' })).toBeVisible()
    await shoot(app, page, 'context')
    await context.getByRole('tablist', { name: 'Context pane' }).getByRole('tab', { name: 'Map' }).click()
    await expect(context.getByRole('region', { name: 'Context map' })).toBeVisible()
    await shoot(app, page, 'context-map')

    await page.keyboard.press('Control+5')
    const terminals: [workspace: RegExp, name: string, command: string, output: string][] = [
      [/^atlas-api\b(?! ·)/, 'api dev server', "Write-Output ('atlas-api: listening on ' + 'http://localhost:4100'); Start-Sleep -Seconds 600", 'atlas-api: listening on'],
      [/^ledger-web\b(?! ·)/, 'test watcher', "Write-Output ('ledger-web: watching ' + '42 test files'); Start-Sleep -Seconds 600", 'ledger-web: watching 42']
    ]
    for (const [workspace, name, command, output] of terminals) {
      await processesView(page).getByRole('button', { name: 'New terminal' }).click()
      await page.getByRole('option', { name: workspace }).first().click()
      await page.getByRole('combobox', { name: 'New terminal' }).fill(command)
      await page.keyboard.press('Enter')
      const terminal = processesView(page).getByRole('region', { name: command })
      await expect(terminal.locator('.xterm-rows')).toContainText(output)
      await terminal.getByRole('button', { name: 'Rename' }).click()
      await page.getByRole('textbox', { name: 'Terminal name' }).fill(name)
      await page.keyboard.press('Enter')
      await expect(processesView(page).getByRole('region', { name })).toBeVisible()
    }
    await shoot(app, page, 'processes')

    await page.keyboard.press('Control+6')
    const view = model3dView(page)
    const lantern = view.getByRole('list', { name: '3D jobs' }).getByRole('listitem').filter({ hasText: /^lantern\.png · prop/ })
    await expect(lantern).toContainText('Done')
    await lantern.getByRole('list', { name: 'Models' }).getByRole('button', { name: 'lantern.glb' }).click()
    await expect(view.getByRole('region', { name: 'Model viewer' }).getByLabel('3D model lantern')).toHaveAttribute('data-state', 'shown')
    await shoot(app, page, '3d')

    await page.keyboard.press('Control+2')
    await resize(app, 1440, 900)
    await row('audit-log').getByRole('button', { name: 'Test', exact: true }).click()
    await shootWindow(app, (url) => url.includes('feature=audit-log'), 'feature-test-flow', (flow) => expect(flow.getByRole('button', { name: 'Pass step 3' })).toBeVisible())
    await shootWindow(app, (url) => /^http:\/\/localhost:\d+/.test(url), 'feature-preview', (preview) => expect(preview.getByRole('heading', { name: 'Audit log' })).toBeVisible())
  } finally {
    await shutdown(app)
    rmSync(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 })
  }
})
