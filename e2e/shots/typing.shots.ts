import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { _electron, expect, test, type ElectronApplication, type Page } from '@playwright/test'
import { shutdown } from '../harness'
import { CODE, env, longTranscript, resize, saveChats, seed, startIn } from './seed'

/**
 * How fast keystrokes land in the prompt box while a 300-message chat on screen works, with ~20 MB of saved chat history.
 * Run at ship time: `pnpm build`, then `pnpm exec playwright test -c e2e/shots/playwright.config.ts e2e/shots/typing.shots.ts`.
 * Fails when, in any scenario, a key takes over 50 ms to its next frame or the p90 is 20 ms or more, or when the turn
 * writes localStorage more than WRITES_PER_EVENT times (or WRITE_CHARS_PER_EVENT characters) per Claude event.
 */

const REPO = resolve(__dirname, '..', '..')
const MAIN = join(REPO, 'out', 'main', 'index.js')
const ELECTRON = require('electron') as unknown as string
const KEYS = 120
const OLD_CHATS = 30
const WORST_MS = 50
const P90_MS = 20
/**
 * Writes are counted over the turn without the keys (the draft they save is not per event): from sending the prompt to
 * its first content, then for this long after the keys.
 */
const WRITES_WINDOW_MS = 4000
/** localStorage writes per Claude event in that window; today 0.02-0.04 calls and 9-15 characters, a store re-saving per event is 1+. */
const WRITES_PER_EVENT = 0.25
const WRITE_CHARS_PER_EVENT = 200

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
  __writes?: { calls: number; bytes: number; byKey: Record<string, number> }
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

declare const Storage: { prototype: { setItem(key: string, value: string): void } }

/** Counts localStorage writes (calls, and key plus value characters) from here on, per key too. */
async function installWriteProbe(page: Page): Promise<void> {
  await page.evaluate(() => {
    const writes = { calls: 0, bytes: 0, byKey: {} as Record<string, number> }
    window.__writes = writes
    const setItem = Storage.prototype.setItem
    Storage.prototype.setItem = function (this: unknown, key: string, value: string) {
      writes.calls++
      writes.bytes += key.length + value.length
      writes.byKey[key] = (writes.byKey[key] ?? 0) + 1
      return setItem.call(this, key, value)
    }
  })
}

/** Counts the Claude events main sends the window from here on. */
async function installEventProbe(app: ElectronApplication): Promise<void> {
  await app.evaluate(({ BrowserWindow }) => {
    const contents = BrowserWindow.getAllWindows()[0].webContents as unknown as { send(channel: string, ...args: unknown[]): void }
    const g = globalThis as unknown as { __claudeEvents: number }
    g.__claudeEvents = 0
    const send = contents.send.bind(contents)
    contents.send = (channel, ...args) => {
      if (channel === 'claude:event') g.__claudeEvents++
      send(channel, ...args)
    }
  })
}

interface Writes {
  events: number
  calls: number
  bytes: number
  byKey: Record<string, number>
}

/** Resets both counters; the returned function reads what was written and sent since. */
async function countWrites(app: ElectronApplication, page: Page): Promise<() => Promise<Writes>> {
  await app.evaluate(() => void ((globalThis as unknown as { __claudeEvents: number }).__claudeEvents = 0))
  await page.evaluate(() => {
    const w = window.__writes!
    w.calls = 0
    w.bytes = 0
    w.byKey = {}
  })
  return async () => {
    const events = await app.evaluate(() => (globalThis as unknown as { __claudeEvents: number }).__claudeEvents)
    const { calls, bytes, byKey } = await page.evaluate(() => window.__writes!)
    return { events, calls, bytes, byKey }
  }
}

function addWrites(a: Writes, b: Writes): Writes {
  const byKey = { ...a.byKey }
  for (const [key, n] of Object.entries(b.byKey)) byKey[key] = (byKey[key] ?? 0) + n
  return { events: a.events + b.events, calls: a.calls + b.calls, bytes: a.bytes + b.bytes, byKey }
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
    await installWriteProbe(page)
    await installEventProbe(app)
    const writes: { scenario: string; w: Writes }[] = []
    const input = page.locator('[data-chat-pane] textarea:visible').first()

    let written = await countWrites(app, page)
    await input.fill('stream a long reply')
    await input.press('Enter')
    await expect(pane.getByText('Paragraph 3').first()).toBeVisible({ timeout: 30_000 })
    let turnStart = await written()
    rows.push(await typeKeys(page, 'streaming text turn'))
    written = await countWrites(app, page)
    await page.waitForTimeout(WRITES_WINDOW_MS)
    writes.push({ scenario: 'streaming text turn', w: addWrites(turnStart, await written()) })
    await pane.getByRole('button', { name: 'Stop', exact: true }).click()
    await expect(pane.locator('[data-working-line]')).toHaveCount(0, { timeout: 30_000 })

    written = await countWrites(app, page)
    await input.fill('tools: read the files')
    await input.press('Enter')
    await expect(pane.getByText('Step 2:').first()).toBeVisible({ timeout: 90_000 })
    turnStart = await written()
    rows.push(await typeKeys(page, 'tool-call turn'))
    written = await countWrites(app, page)
    await page.waitForTimeout(WRITES_WINDOW_MS)
    writes.push({ scenario: 'tool-call turn', w: addWrites(turnStart, await written()) })

    console.table(rows.map(({ exact: _, ...row }) => row))
    console.table(writes.map(({ scenario, w }) => ({ scenario, events: w.events, writes: w.calls, bytes: w.bytes, perEvent: +(w.calls / w.events).toFixed(3), bytesPerEvent: Math.round(w.bytes / w.events) })))
    for (const { scenario, w } of writes) console.log(`[writes] ${scenario}: ${JSON.stringify(w.byKey)}`)
    for (const row of rows) {
      expect.soft(row.exact.worst, `${row.scenario}: worst key (ms)`).toBeLessThanOrEqual(WORST_MS)
      expect.soft(row.exact.p90, `${row.scenario}: p90 (ms)`).toBeLessThan(P90_MS)
    }
    for (const { scenario, w } of writes) {
      expect.soft(w.events, `${scenario}: Claude events counted`).toBeGreaterThan(50)
      expect.soft(w.calls / w.events, `${scenario}: localStorage writes per event`).toBeLessThanOrEqual(WRITES_PER_EVENT)
      expect.soft(w.bytes / w.events, `${scenario}: localStorage characters written per event`).toBeLessThanOrEqual(WRITE_CHARS_PER_EVENT)
    }
    expect(online, 'the window reached the internet').toEqual([])
  } finally {
    await shutdown(app)
    rmSync(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 })
  }
})
