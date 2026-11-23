import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { _electron, expect, test, type Page } from '@playwright/test'
import { shutdown } from '../harness'
import { env, resize, seed, startIn } from './seed'

/**
 * Work, Board, Dashboard and Settings at 110%, 125% and 150% zoom on a 1440×900 window, and a check that nothing overflows sideways.
 * Run: `pnpm build`, then `pnpm exec playwright test -c e2e/shots/playwright.config.ts zoom`.
 * SHOTS_DIR (default `.scratch/zoom-and-sidebar/shots/`) holds the files.
 */

const REPO = resolve(__dirname, '..', '..')
const MAIN = join(REPO, 'out', 'main', 'index.js')
const ELECTRON = require('electron') as unknown as string
const OUT = process.env.SHOTS_DIR ?? join(REPO, '.scratch', 'zoom-and-sidebar', 'shots')

// Browser globals of the function that runs inside the page; this project compiles against Node's types.
interface Box {
  scrollWidth: number
  clientWidth: number
}
interface Rect {
  x: number
  y: number
  right: number
  width: number
  height: number
}
declare const document: {
  querySelectorAll(selector: string): ArrayLike<Box & { getAttribute(n: string): string | null; tagName: string; textContent: string | null; getBoundingClientRect(): Rect }>
}

/** Elements that clip text on purpose (truncate) are left out; anything else wider than its box overflows. */
async function overflowing(page: Page, selectors: string[]): Promise<string[]> {
  return page.evaluate((sels) => {
    const out: string[] = []
    for (const sel of sels) {
      const all = document.querySelectorAll(sel)
      for (let i = 0; i < all.length; i++) {
        const el = all[i]
        if (el.scrollWidth > el.clientWidth + 1) out.push(`${sel} #${i} (${el.scrollWidth} > ${el.clientWidth})`)
      }
    }
    return out
  }, selectors)
}

const LIST = 'nav[aria-label="Sessions"]'

/** The Work list at its default 300 px: usage percentages and verdicts sit whole inside it, and rows give the model's room to the title. */
async function narrowListProblems(page: Page): Promise<string[]> {
  return page.evaluate((list) => {
    const out: string[] = []
    const box = document.querySelectorAll(list)[0].getBoundingClientRect()
    if (box.width > 360) out.push(`the list is ${box.width}px wide, not narrow`)
    const uncut = document.querySelectorAll(`${list} .meter-line-head, ${list} .meter-line-verdict`)
    if (uncut.length === 0) out.push('no usage lines')
    for (let i = 0; i < uncut.length; i++) {
      const r = uncut[i].getBoundingClientRect()
      if (r.width === 0 || r.right > box.right + 0.5) out.push(`cut: ${uncut[i].textContent}`)
    }
    const models = document.querySelectorAll(`${list} .hide-in-narrow-list`)
    if (models.length === 0) out.push('no row has a model to hide')
    for (let i = 0; i < models.length; i++) if (models[i].getBoundingClientRect().width > 0) out.push(`model shown: ${models[i].textContent}`)
    return out
  }, LIST)
}

for (const percent of [110, 125, 150]) {
  test(`layout at ${percent}%`, async () => {
    const root = mkdtempSync(join(tmpdir(), 'cc-zoom-'))
    const seeded = seed(root)
    const work = join(root, 'claude-work')
    mkdirSync(work, { recursive: true })
    writeFileSync(join(work, '.credentials.json'), '{}')
    writeFileSync(join(work, 'fake-account.json'), JSON.stringify({ email: 'andreas@work.example', organization: 'Work AB', subscriptionType: 'Claude Team' }))
    writeFileSync(join(seeded.userData, 'profiles.json'), JSON.stringify([{ id: 'p-work', name: 'Work', createdAt: 1, configDir: work }]))
    const onWork = seeded.workspaces.map((w) => ({ ...w, createdAt: Date.now(), ...(w.name === 'pixel-forge' ? { profileId: 'p-work' } : {}) }))
    writeFileSync(join(seeded.userData, 'projects.json'), JSON.stringify(onWork))
    mkdirSync(OUT, { recursive: true })
    writeFileSync(join(seeded.userData, 'zoom.json'), JSON.stringify({ level: Math.log(percent / 100) / Math.log(1.2) }))
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
      await startIn(page, 'ledger-web', 'run the onboarding tests', 'Ran the onboarding suite')
      const shot = async (name: string) => {
        await page.waitForTimeout(800)
        // Playwright's page screenshot crops a zoomed page to its CSS viewport, so the window paints itself instead.
        const png = await app.evaluate(async ({ BrowserWindow }) => (await BrowserWindow.getAllWindows()[0].webContents.capturePage()).toPNG().toString('base64'))
        writeFileSync(join(OUT, `zoom-${percent}-${name}.png`), Buffer.from(png, 'base64'))
      }
      const sideways = ['body', 'header', 'nav[aria-label="Sessions"]', 'nav[aria-label="Sessions"] li']

      await shot('work')
      expect(await overflowing(page, sideways)).toEqual([])
      await expect(page.locator(`${LIST} .meter-line-verdict`).first()).toBeVisible({ timeout: 15_000 })
      expect(await narrowListProblems(page)).toEqual([])
      const workSection = page.getByRole('navigation', { name: 'Sessions' }).getByRole('button', { name: /^Work · Claude Team/ })
      await workSection.click()
      await expect(workSection.getByText(/^\d+ waiting$/)).toBeVisible()
      const listBox = (await page.locator(LIST).boundingBox())!
      const listPng = await app.evaluate(async ({ BrowserWindow }, b) => {
        const contents = BrowserWindow.getAllWindows()[0].webContents
        const z = contents.getZoomFactor()
        const rect = { x: Math.round(b.x * z), y: Math.round(b.y * z), width: Math.round(b.width * z), height: Math.round(b.height * z) }
        return (await contents.capturePage(rect)).toPNG().toString('base64')
      }, listBox)
      writeFileSync(join(OUT, `zoom-${percent}-work-list-narrow.png`), Buffer.from(listPng, 'base64'))
      expect(await overflowing(page, sideways)).toEqual([])
      await workSection.click()

      await page.keyboard.press('Control+b')
      await shot('work-list-hidden')
      await page.keyboard.press('Control+b')

      await page.getByRole('navigation', { name: 'Sessions' }).getByText('Write the export presets').click({ modifiers: ['Control'] })
      await expect(page.locator('[data-header-row]:visible')).toHaveCount(2)
      await expect(page.getByRole('button', { name: /^Account: Work · Claude Team$/ })).toBeVisible()
      await expect(page.getByRole('button', { name: /^Account: someone@example\.com/ })).toBeVisible()
      await shot('work-split')
      expect(await overflowing(page, [...sideways, '[data-header-row]'])).toEqual([])
      const tabs = page.locator('[data-tab-strip]:visible')
      await expect(tabs).toHaveCount(1)
      await tabs.getByRole('tab', { name: 'Media 1' }).click()
      await expect(page.getByRole('tabpanel', { name: 'Media' })).toBeVisible()
      await shot('work-split-media')
      expect(await overflowing(page, [...sideways, '[data-header-row]', '[data-tab-strip]'])).toEqual([])

      await page.keyboard.press('Control+3')
      await expect(page.getByTestId('view-board')).toBeVisible()
      await shot('board')
      expect(await overflowing(page, ['body', 'header'])).toEqual([])

      await page.keyboard.press('Control+1')
      await expect(page.getByTestId('view-dashboard')).toBeVisible()
      await shot('dashboard')
      expect(await overflowing(page, ['body', 'header'])).toEqual([])

      await page.keyboard.press('Control+,')
      await shot('settings')
      expect(await overflowing(page, ['body', 'header'])).toEqual([])
    } finally {
      await shutdown(app)
      rmSync(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 })
    }
  })
}
