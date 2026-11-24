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
interface Element extends Box {
  getAttribute(n: string): string | null
  tagName: string
  textContent: string | null
  getBoundingClientRect(): Rect
  querySelectorAll(selector: string): ArrayLike<Element>
}
declare const document: {
  querySelectorAll(selector: string): ArrayLike<Element>
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

/** The Work list at its default 300 px: each account header's percentage sits whole inside it, repo group headers fit, and rows give the model's room to the title. */
async function narrowListProblems(page: Page): Promise<string[]> {
  return page.evaluate((list) => {
    const out: string[] = []
    const box = document.querySelectorAll(list)[0].getBoundingClientRect()
    if (box.width > 360) out.push(`the list is ${box.width}px wide, not narrow`)
    const percents = document.querySelectorAll(`${list} section > button .meter-reading-percent`)
    if (percents.length < 2) out.push(`${percents.length} account header percentages, not 2`)
    for (let i = 0; i < percents.length; i++) {
      const r = percents[i].getBoundingClientRect()
      if (r.width === 0 || r.right > box.right + 0.5 || !/^\d+%$/.test(percents[i].textContent ?? '')) out.push(`cut: ${percents[i].textContent}`)
    }
    const repos = document.querySelectorAll(`${list} section section > button`)
    if (repos.length < 3) out.push(`${repos.length} repo group headers, not 3`)
    for (let i = 0; i < repos.length; i++) if (repos[i].getBoundingClientRect().right > box.right + 0.5) out.push(`repo header past the list: ${repos[i].textContent}`)
    const models = document.querySelectorAll(`${list} .hide-in-narrow-list`)
    if (models.length === 0) out.push('no row has a model to hide')
    for (let i = 0; i < models.length; i++) if (models[i].getBoundingClientRect().width > 0) out.push(`model shown: ${models[i].textContent}`)
    return out
  }, LIST)
}

/** Each visible prompt footer: the effort pill sits whole beside the model pill, down to its icon below the 460 px rule. */
async function footerProblems(page: Page, expectNarrow: boolean): Promise<string[]> {
  return page.evaluate((narrowExpected) => {
    const out: string[] = []
    let narrow = 0
    const footers = document.querySelectorAll('[data-chat-pane] .input-footer')
    let seen = 0
    for (let i = 0; i < footers.length; i++) {
      const footer = footers[i]
      const box = footer.getBoundingClientRect()
      if (box.width === 0) continue
      seen++
      const effort = footer.querySelectorAll('button[aria-label^="Effort: "]')[0]
      const model = footer.querySelectorAll('button[title="Switch model"]')[0]
      if (!effort || !model) {
        out.push(`footer #${i}: no ${effort ? 'model' : 'effort'} pill`)
        continue
      }
      const e = effort.getBoundingClientRect()
      const m = model.getBoundingClientRect()
      if (e.x < m.right - 0.5) out.push(`footer #${i}: effort pill overlaps the model pill`)
      if (e.right > box.right + 0.5) out.push(`footer #${i}: effort pill past the footer`)
      if (effort.scrollWidth > effort.clientWidth + 1) out.push(`footer #${i}: effort pill cut`)
      const word = effort.querySelectorAll('[data-pill-label]')[0].getBoundingClientRect().width
      if (box.width <= 460) narrow++
      if (box.width <= 460 && word > 0) out.push(`footer #${i}: ${box.width}px wide but the effort word shows`)
      if (box.width > 460 && word === 0) out.push(`footer #${i}: ${box.width}px wide but the effort word is hidden`)
    }
    if (seen === 0) out.push('no prompt footer')
    if (narrowExpected && narrow === 0) out.push('no footer is narrow enough to shrink the effort pill')
    return out
  }, expectNarrow)
}

/** A few past sessions of one workspace, for the project picker's second step. */
function seedPastSessions(configDir: string, workspacePath: string): void {
  const dir = join(configDir, 'projects', workspacePath.replace(/[^a-zA-Z0-9]/g, '-'))
  mkdirSync(dir, { recursive: true })
  const sessions: [string, string][] = [
    ['Welcome step and workspace picker, with the long copy the designers asked for', 'feature/onboarding-welcome-step'],
    ['Email verification links expire after 24 h', 'feature/email-verification'],
    ['Sign-up form validation', 'main']
  ]
  sessions.forEach(([title, gitBranch], i) => {
    const id = `3333333${i}-3333-4333-8333-333333333333`
    const lines = [
      JSON.stringify({ type: 'user', gitBranch, message: { role: 'user', content: [{ type: 'text', text: title }] } }),
      JSON.stringify({ type: 'ai-title', aiTitle: title, sessionId: id })
    ]
    writeFileSync(join(dir, `${id}.jsonl`), lines.join('\n') + '\n')
  })
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
    seedPastSessions(seeded.configDir, seeded.workspaces.find((w) => w.name === 'ledger-web')!.path)
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
      expect(await footerProblems(page, false)).toEqual([])
      await page.locator('[data-chat-pane]:visible').getByRole('button', { name: /^Effort: / }).click()
      await expect(page.getByRole('dialog', { name: 'Effort' })).toBeVisible()
      await shot('work-effort')
      await page.keyboard.press('Escape')
      await expect(page.locator(`${LIST} section > button .meter-reading-percent`)).toHaveCount(2, { timeout: 15_000 })
      expect(await narrowListProblems(page)).toEqual([])
      const listShot = async (name: string) => {
        const listBox = (await page.locator(LIST).boundingBox())!
        const listPng = await app.evaluate(async ({ BrowserWindow }, b) => {
          const contents = BrowserWindow.getAllWindows()[0].webContents
          const z = contents.getZoomFactor()
          const rect = { x: Math.round(b.x * z), y: Math.round(b.y * z), width: Math.round(b.width * z), height: Math.round(b.height * z) }
          return (await contents.capturePage(rect)).toPNG().toString('base64')
        }, listBox)
        writeFileSync(join(OUT, `zoom-${percent}-${name}.png`), Buffer.from(listPng, 'base64'))
      }
      await listShot('work-list-accounts')
      const workSection = page.getByRole('navigation', { name: 'Sessions' }).getByRole('button', { name: /^Work · Team/ })
      await workSection.click()
      await expect(workSection.getByText(/^\d+ waiting$/)).toBeVisible()
      await listShot('work-list-narrow')
      expect(await overflowing(page, sideways)).toEqual([])
      await workSection.click()

      await page.keyboard.press('Control+l')
      const picker = page.getByRole('dialog', { name: 'Open a workspace' })
      await expect(picker.getByRole('option', { name: /^Sign-up form validation/ })).toBeVisible()
      await shot('picker-sessions')
      expect(await overflowing(page, ['body', '[role="dialog"]', '[role="dialog"] [role="option"]'])).toEqual([])
      await page.keyboard.press('Escape')
      await expect(picker).toHaveCount(0)

      await page.keyboard.press('Control+b')
      await shot('work-list-hidden')
      await page.keyboard.press('Control+b')

      await page.getByRole('navigation', { name: 'Sessions' }).getByText('Write the export presets').click({ modifiers: ['Control'] })
      await expect(page.locator('[data-header-row]:visible')).toHaveCount(2)
      await expect(page.getByRole('button', { name: /^Account: Work · Claude Team$/ })).toBeVisible()
      await expect(page.getByRole('button', { name: /^Account: Personal/ })).toBeVisible()
      await shot('work-split')
      expect(await overflowing(page, [...sideways, '[data-header-row]'])).toEqual([])
      expect(await footerProblems(page, percent === 150)).toEqual([])
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

      if (percent === 150) {
        await page.keyboard.press('Escape')
        // The split from above stays, so each new chat opens in its focused half.
        const startFocused = async (workspace: string, text: string, expectText: string) => {
          await page.keyboard.press('Control+2')
          await page.keyboard.press('Control+t')
          await page.getByRole('option', { name: new RegExp(`^${workspace}\\b`) }).first().click()
          await page.getByRole('option', { name: 'New chat' }).click()
          const input = page.locator('[data-chat-pane] textarea:focus')
          await expect(input).toBeVisible()
          await input.fill(text)
          await input.press('Enter')
          await expect(page.locator('[data-chat-pane]').getByText(expectText).first()).toBeVisible()
        }
        await startFocused('ledger-web', 'bash: check the migrations', 'Checking the migrations')
        await startFocused('atlas-api · auth', 'edit: rename the token field', 'Renaming the field')
        await startFocused('pixel-forge', 'ask: export options', 'Two questions about the export')
        await page.keyboard.press('Control+Shift+A')
        const inbox = page.getByRole('dialog', { name: /^Approvals/ })
        const rows = inbox.getByRole('list', { name: 'Waiting approvals' }).getByRole('listitem')
        await expect(rows).toHaveCount(4)
        await expect(inbox.getByRole('group', { name: 'Approve Write' })).toBeVisible()
        await page.keyboard.press('1')
        await expect(rows).toHaveCount(3)
        await page.keyboard.press('j')
        await expect(inbox.getByRole('group', { name: 'Approve Edit' })).toBeVisible()
        await shot('approvals')
        expect(await overflowing(page, ['body', '[data-approval-inbox]', '[data-approval-inbox] li', '[data-choice-prompt]'])).toEqual([])
        await page.keyboard.press('j')
        await expect(inbox.getByRole('group', { name: 'Questions from Claude' })).toBeVisible()
        await shot('approvals-question')
        expect(await overflowing(page, ['[data-approval-inbox]', '[data-choice-prompt]'])).toEqual([])
        await page.keyboard.press('Escape')
        await expect(inbox).toHaveCount(0)

        await expect(page.locator('[data-header-row]:visible')).toHaveCount(2)
        const card = page.locator('[data-chat-pane]:visible').getByRole('group', { name: 'Questions from Claude' })
        await card.getByRole('tab', { name: 'Layout' }).click()
        await expect(card.getByRole('region', { name: 'Preview: Table' })).toBeVisible()
        await shot('work-split-question')
        expect(await overflowing(page, [...sideways, '[data-header-row]', '[data-choice-prompt]'])).toEqual([])

        await startFocused('notes-cli', 'agents: two for the review', 'Two agents are working')
        await listShot('work-list-repos')
        expect(await overflowing(page, [...sideways, `${LIST} section > button`])).toEqual([])
        const agentsPane = page.locator('[data-chat-pane]:visible', { has: page.getByText('Two agents are working') })
        await expect(agentsPane.locator('[data-agents-still-working]')).toContainText('2 agents still working')
        await agentsPane.getByRole('tab', { name: 'Agents 2' }).click()
        const agentList = agentsPane.getByRole('list', { name: 'Agents' })
        await expect(agentList.getByRole('button')).toHaveCount(2)
        await expect(agentList.getByRole('button').first()).toContainText('now: ')
        await shot('work-split-agents')
        expect(await overflowing(page, [...sideways, '[data-header-row]', '[data-tab-strip]'])).toEqual([])
        await agentList.getByRole('button', { name: /Map the token store/ }).click()
        const agentView = agentsPane.locator('[data-agent-view]')
        await expect(agentView.getByText('Reading how tokens are stored.').first()).toBeVisible()
        await expect(agentView.getByRole('button', { name: 'Stop agent' })).toBeVisible()
        await shot('work-split-agent-view')
        expect(await overflowing(page, [...sideways, '[data-header-row]', '[data-agent-view]'])).toEqual([])
      }
    } finally {
      await shutdown(app)
      rmSync(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 })
    }
  })
}
