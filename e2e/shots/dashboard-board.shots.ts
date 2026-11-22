import { mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { _electron, expect, test, type ElectronApplication, type Page } from '@playwright/test'
import { shutdown } from '../harness'
import { env, resize, seed, startIn } from './seed'

/**
 * Screenshots of the Dashboard and the Board on a seeded set of fake repos, for judging the look.
 * Run: `pnpm build`, then `pnpm exec playwright test -c e2e/shots/playwright.config.ts`.
 * SHOTS_PREFIX (default `shot`) names the files; SHOTS_DIR (default `.scratch/polish/shots/`) holds them.
 */

const REPO = resolve(__dirname, '..', '..')
const MAIN = join(REPO, 'out', 'main', 'index.js')
const ELECTRON = require('electron') as unknown as string
const OUT = process.env.SHOTS_DIR ?? join(REPO, '.scratch', 'polish', 'shots')
const PREFIX = process.env.SHOTS_PREFIX ?? 'shot'

async function shoot(app: ElectronApplication, page: Page, name: string): Promise<void> {
  for (const [label, w, h] of [['1440', 1440, 900], ['1100', 1100, 800]] as const) {
    await resize(app, w, h)
    await page.waitForTimeout(400)
    await page.screenshot({ path: join(OUT, `${PREFIX}-${name}-${label}.png`) })
  }
}

test('dashboard and board screenshots', async () => {
  const root = mkdtempSync(join(tmpdir(), 'cc-shots-'))
  const seeded = seed(root)
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
    await startIn(page, 'pixel-forge', 'write the export presets', 'add the export preset file')
    await expect(page.getByRole('group', { name: 'Approve Write' })).toBeVisible()
    await startIn(page, 'ledger-web', 'run the onboarding tests', 'Ran the onboarding suite')
    await startIn(page, 'notes-cli', null, null)

    await page.keyboard.press('Control+1')
    await expect(page.getByTestId('view-dashboard')).toBeVisible()
    await page.waitForTimeout(1500)
    await shoot(app, page, 'dashboard')

    await page.keyboard.press('Control+3')
    await expect(page.getByTestId('view-board')).toBeVisible()
    await page.waitForTimeout(1500)
    await shoot(app, page, 'board')

    const card = page.getByTestId('view-board').getByText('Rotate signing keys without downtime').first()
    await card.click()
    await page.waitForTimeout(600)
    await shoot(app, page, 'board-drawer')
  } finally {
    await shutdown(app)
    rmSync(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 })
  }
})
