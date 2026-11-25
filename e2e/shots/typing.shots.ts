import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { _electron, expect, test, type Page } from '@playwright/test'
import { shutdown } from '../harness'
import { CODE, env, longTranscript, resize, saveChats, seed, startIn } from './seed'

/**
 * How fast keystrokes land in the prompt box while a 300-message chat on screen works, with ~20 MB of saved chat history.
 * Run at ship time: `pnpm build`, then `pnpm exec playwright test -c e2e/shots/playwright.config.ts e2e/shots/typing.shots.ts`.
 * Fails when, in any scenario, a key takes over 50 ms to its next frame or the p90 is 20 ms or more.
 */

const REPO = resolve(__dirname, '..', '..')
const MAIN = join(REPO, 'out', 'main', 'index.js')
const ELECTRON = require('electron') as unknown as string
const KEYS = 120
const OLD_CHATS = 30
const WORST_MS = 50
const P90_MS = 20

const paragraph = (i: number): string =>
  `Paragraph ${i} explains how the reader keeps its offset and why the store returns early on an empty file, with \`inline\` code too.\n\n\`\`\`ts\n${CODE.split('\n').slice(0, 8).join('\n')}\n\`\`\`\n\n`

/** The seeded script plus two turns: "stream…" streams long text, "tools…" commits a text and a tool call once a second. */
function script(): string {
  const base = JSON.parse(readFileSync(join(__dirname, 'script.json'), 'utf8')) as { turns: unknown[] }
  const stream = Array.from({ length: 6 }, () => ({ type: 'text', text: Array.from({ length: 25 }, (_, i) => paragraph(i)).join('') }))
  const tools = Array.from({ length: 40 }, (_, k) => [
    { type: 'text', text: `Step ${k}: reading the next file to check the offset handling.` },
    { type: 'tool_use', name: 'Read', input: { file_path: '{cwd}{sep}README.md' }, approval: false, result: 'y'.repeat(4000), delayMs: 1000 }
  ]).flat()
  base.turns.unshift({ match: '^stream', repeat: true, deltaDelayMs: 20, events: stream }, { match: '^tools', repeat: true, deltaDelayMs: 20, events: tools })
  return JSON.stringify(base)
}

// Browser globals of the functions that run inside the page; this project compiles against Node's types.
interface Probe {
  api: { chatHistory: { loadSync(): Record<string, unknown[]> } }
  addEventListener(type: string, listener: (e: { type: string; timeStamp: number }) => void, capture: boolean): void
  __keyArm?: () => void
  __keyResult?: () => Promise<number>
}
declare const window: Probe
declare function requestAnimationFrame(callback: () => void): number

/** Arms a capture listener for the next keydown; the result is the time from that event to the frame after it. */
async function installProbe(page: Page): Promise<void> {
  await page.evaluate(() => {
    let pending: Promise<number> | null = null
    let resolveArm: ((ms: number) => void) | null = null
    window.addEventListener(
      'keydown',
      (e) => {
        if (!resolveArm) return
        const done = resolveArm
        resolveArm = null
        const t0 = e.timeStamp
        requestAnimationFrame(() => setTimeout(() => done(performance.now() - t0), 0))
      },
      true
    )
    window.__keyArm = () => {
      pending = new Promise((r) => (resolveArm = r))
    }
    window.__keyResult = () => pending ?? Promise.reject(new Error('not armed'))
  })
}

interface Row {
  scenario: string
  median: number
  p90: number
  worst: number
  over50: number
  /** Unrounded, for the limits. */
  exact: { p90: number; worst: number }
}

const percentile = (xs: number[], p: number): number => [...xs].sort((a, b) => a - b)[Math.min(xs.length - 1, Math.floor(xs.length * p))]

/** Types KEYS keys into the visible prompt box, focused without a click, then empties it. */
async function typeKeys(page: Page, scenario: string): Promise<Row> {
  const input = page.locator('[data-chat-pane] textarea:visible').first()
  await input.focus()
  const ms: number[] = []
  for (let k = 0; k < KEYS; k++) {
    await page.evaluate(() => window.__keyArm!())
    await page.keyboard.press('a')
    ms.push(await page.evaluate(() => window.__keyResult!()))
    await page.waitForTimeout(40)
  }
  await input.fill('')
  const p90 = percentile(ms, 0.9)
  const worst = Math.max(...ms)
  return { scenario, median: Math.round(percentile(ms, 0.5)), p90: Math.round(p90), worst: Math.round(worst), over50: ms.filter((x) => x > WORST_MS).length, exact: { p90, worst } }
}

test('typing while a 300-message chat works', async () => {
  test.setTimeout(600_000)
  const root = mkdtempSync(join(tmpdir(), 'cc-typing-'))
  const seeded = seed(root)
  const launchEnv = env(seeded, join(root, 'fake.log'))
  launchEnv.FAKE_CLAUDE_SCRIPT = join(root, 'script.json')
  writeFileSync(launchEnv.FAKE_CLAUDE_SCRIPT, script())
  const app = await _electron.launch({ executablePath: ELECTRON, args: [MAIN, `--user-data-dir=${seeded.userData}`], cwd: REPO, env: launchEnv })
  const online: string[] = []
  const rows: Row[] = []
  try {
    await app.context().route(/^https?:\/\//, (route) => {
      online.push(route.request().url())
      return route.abort()
    })
    let page = await app.firstWindow()
    await page.waitForLoadState('domcontentloaded')
    await resize(app, 1440, 900)
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].webContents.setBackgroundThrottling(false))
    // No turn yet, so the session has no saved history of its own and the seeded one is what loads.
    await startIn(page, 'pixel-forge', null, null)
    await page.waitForTimeout(1500)
    const mb = await saveChats(page, seeded.userData, { 'pixel-forge': longTranscript('pf') }, OLD_CHATS)
    console.log(`[seed] ${mb.toFixed(1)} MB of chat history`)
    await page.reload()
    page = app.windows()[0]
    await page.waitForLoadState('domcontentloaded')
    await page.keyboard.press('Control+2')
    await page.getByRole('navigation', { name: 'Sessions' }).getByText('New session', { exact: true }).last().click()
    const pane = page.locator('[data-chat-pane]:visible').first()
    await expect(pane.getByText('step 149: refactor').first()).toBeAttached({ timeout: 30_000 })
    await page.waitForTimeout(1000)
    const loadedMb = await page.evaluate(() => JSON.stringify(window.api.chatHistory.loadSync()).length / 1024 / 1024)
    console.log(`[seed] the app loads ${loadedMb.toFixed(1)} MB of chat history`)
    expect(loadedMb, 'chat history the app loads (MB)').toBeGreaterThan(15)
    await installProbe(page)
    const input = page.locator('[data-chat-pane] textarea:visible').first()

    await input.fill('stream a long reply')
    await input.press('Enter')
    await expect(pane.getByText('Paragraph 3').first()).toBeVisible({ timeout: 30_000 })
    rows.push(await typeKeys(page, 'streaming text turn'))
    await pane.getByRole('button', { name: 'Stop', exact: true }).click()
    await expect(pane.locator('[data-working-line]')).toHaveCount(0, { timeout: 30_000 })

    await input.fill('tools: read the files')
    await input.press('Enter')
    await expect(pane.getByText('Step 2:').first()).toBeVisible({ timeout: 90_000 })
    rows.push(await typeKeys(page, 'tool-call turn'))

    console.table(rows.map(({ exact: _, ...row }) => row))
    for (const row of rows) {
      expect.soft(row.exact.worst, `${row.scenario}: worst key (ms)`).toBeLessThanOrEqual(WORST_MS)
      expect.soft(row.exact.p90, `${row.scenario}: p90 (ms)`).toBeLessThan(P90_MS)
    }
    expect(online, 'the window reached the internet').toEqual([])
  } finally {
    await shutdown(app)
    rmSync(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 })
  }
})
