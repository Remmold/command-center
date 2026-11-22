import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { _electron, expect, test, type Locator, type Page } from '@playwright/test'
import { shutdown } from '../harness'
import { env, resize, seed, startIn } from './seed'

/**
 * Click-to-next-frame timings on the seeded repos, with two chats of 300 messages each open.
 * Run: `pnpm build`, then `pnpm exec playwright test -c e2e/shots/playwright.config.ts perf`.
 * PERF_TRIES (default 10) sets the tries per action; PERF_OUT names a JSON file for the samples.
 * PERF_PROFILE=<part of an action name> prints a CPU profile and trace summary of its first try (PERF_TRACE_OUT saves the trace);
 * PERF_IDLE=<ms> lists the long tasks while the app sits idle that long. Fails when a median exceeds its bound.
 */

const REPO = resolve(__dirname, '..', '..')
const MAIN = join(REPO, 'out', 'main', 'index.js')
const ELECTRON = require('electron') as unknown as string
const TRIES = Number(process.env.PERF_TRIES ?? 10)
const LONG_MESSAGES = 300

const CODE = Array.from({ length: 30 }, (_, i) => `  const value${i} = await store.read('key-${i}') ?? fallback(${i}) // line ${i}`).join('\n')

function longTranscript(tag: string): unknown[] {
  const items: unknown[] = []
  for (let i = 0; i < LONG_MESSAGES / 2; i++) {
    const at = Date.now() - (LONG_MESSAGES - i) * 60_000
    items.push({ kind: 'user', id: `${tag}-u${i}`, text: `step ${i}: refactor the reader for case ${i}`, at })
    const text = [
      `Here is step **${i}**. The reader now keeps \`offset\` in the store and returns early on an empty file.`,
      '',
      `- checked case ${i}`,
      `- kept the old path for \`legacy\` input`,
      '',
      '```ts',
      `export async function read${i}(store: Store): Promise<number> {`,
      CODE,
      '  return value0',
      '}',
      '```',
      '',
      'Tests pass.'
    ].join('\n')
    const message = { id: `${tag}-m${i}`, role: 'assistant', content: [{ type: 'text', text }] }
    items.push({ kind: 'assistant', id: `${tag}-a${i}`, content: message.content, raw: { type: 'assistant', message }, at })
  }
  return items
}

// Browser globals of the functions that run inside the page; this project compiles against Node's types.
interface Probe {
  addEventListener(type: string, listener: (e: { type: string; timeStamp: number }) => void, capture: boolean): void
  __perfArm?: (type: string) => void
  __perfResult?: () => Promise<{ frame: number; settled: number }>
}
declare const window: Probe
declare const localStorage: { getItem(key: string): string | null; setItem(key: string, value: string): void }
declare function requestAnimationFrame(callback: () => void): number

/** Arms a capture listener for the next `type` event; the result is the time from that event to the next frame, and to quiet frames. */
async function installProbe(page: Page): Promise<void> {
  await page.evaluate(() => {
    let pending: Promise<{ frame: number; settled: number }> | null = null
    let armedType: string | null = null
    let resolveArm: ((r: { frame: number; settled: number }) => void) | null = null
    const onEvent = (e: { type: string; timeStamp: number }): void => {
      if (e.type !== armedType || !resolveArm) return
      armedType = null
      const done = resolveArm
      resolveArm = null
      const t0 = e.timeStamp
      requestAnimationFrame(() => {
        setTimeout(() => {
          const frame = performance.now() - t0
          let last = performance.now()
          let quiet = 0
          let settled = frame
          const tick = (): void => {
            const now = performance.now()
            if (now - last < 25) quiet++
            else {
              quiet = 0
              settled = now - t0
            }
            last = now
            if (quiet >= 3 || now - t0 > 3000) done({ frame, settled })
            else requestAnimationFrame(tick)
          }
          requestAnimationFrame(tick)
        }, 0)
      })
    }
    for (const type of ['click', 'keydown']) window.addEventListener(type, onEvent, true)
    window.__perfArm = (type: string) => {
      armedType = type
      pending = new Promise((r) => (resolveArm = r))
    }
    window.__perfResult = () => pending ?? Promise.reject(new Error('not armed'))
  })
}

interface Stat {
  action: string
  frames: number[]
  settled: number[]
}

const stats: Stat[] = []

const PROFILE = process.env.PERF_PROFILE
const profiled = new Set<string>()

interface ProfileNode {
  id: number
  callFrame: { functionName: string; url: string; lineNumber: number }
  hitCount?: number
}

/** Self time per function of a CPU profile, the 15 heaviest. */
function topSelf(profile: { nodes: ProfileNode[]; samples: number[]; timeDeltas: number[] }): string[] {
  const byNode = new Map(profile.nodes.map((n) => [n.id, n]))
  const self = new Map<string, number>()
  profile.samples.forEach((id, i) => {
    const f = byNode.get(id)!.callFrame
    const key = `${f.functionName || '(anon)'} ${f.url.split('/').pop()}:${f.lineNumber}`
    self.set(key, (self.get(key) ?? 0) + (profile.timeDeltas[i] ?? 0) / 1000)
  })
  return [...self.entries()].sort((a, b) => b[1] - a[1]).slice(0, 15).map(([k, ms]) => `${ms.toFixed(0).padStart(6)} ms  ${k}`)
}

interface TraceEvent {
  name: string
  ph: string
  dur?: number
  tid: number
  args?: { name?: string }
}

/** Total duration per event name on the renderer's main thread, the 15 heaviest (nested events count in their parents too). */
function topEvents(events: TraceEvent[]): string[] {
  const main = events.find((e) => e.name === 'thread_name' && e.args?.name === 'CrRendererMain')?.tid
  const total = new Map<string, number>()
  for (const e of events) if (e.tid === main && e.ph === 'X' && e.dur) total.set(e.name, (total.get(e.name) ?? 0) + e.dur / 1000)
  return [...total.entries()].sort((a, b) => b[1] - a[1]).slice(0, 15).map(([k, ms]) => `${ms.toFixed(0).padStart(6)} ms  ${k}`)
}

async function sample(page: Page, action: string, type: 'click' | 'keydown', run: () => Promise<void>, after?: () => Promise<void>): Promise<void> {
  let stat = stats.find((s) => s.action === action)
  if (!stat) stats.push((stat = { action, frames: [], settled: [] }))
  const profiling = PROFILE !== undefined && action.includes(PROFILE) && !profiled.has(action)
  const cdp = profiling ? await page.context().newCDPSession(page) : null
  if (cdp) {
    profiled.add(action)
    await cdp.send('Profiler.enable')
    await cdp.send('Profiler.setSamplingInterval', { interval: 200 })
    await cdp.send('Profiler.start')
    await cdp.send('Tracing.start', { categories: 'devtools.timeline,disabled-by-default-devtools.timeline,blink', transferMode: 'ReportEvents' })
  }
  await page.evaluate((t) => window.__perfArm!(t), type)
  await run()
  const r = await page.evaluate(() => window.__perfResult!())
  if (cdp) {
    const { profile } = await cdp.send('Profiler.stop')
    const events: TraceEvent[] = []
    cdp.on('Tracing.dataCollected', ({ value }) => events.push(...(value as unknown as TraceEvent[])))
    const ended = new Promise((r) => cdp.once('Tracing.tracingComplete', r))
    await cdp.send('Tracing.end')
    await ended
    if (process.env.PERF_TRACE_OUT) writeFileSync(process.env.PERF_TRACE_OUT, JSON.stringify({ traceEvents: events }))
    console.log(`[profile] ${action}\n` + topSelf(profile as never).join('\n') + `\n[trace] ${action}\n` + topEvents(events).join('\n'))
    await cdp.detach()
  }
  stat.frames.push(r.frame)
  stat.settled.push(r.settled)
  await after?.()
  await page.waitForTimeout(80)
}

/** Clicks the target's centre with raw mouse events, so Playwright's locator checks stay out of the timed span. */
async function sampleClick(page: Page, action: string, target: Locator, after?: () => Promise<void>): Promise<void> {
  const box = await target.boundingBox()
  if (!box) throw new Error(`${action}: target not on screen`)
  await sample(page, action, 'click', () => page.mouse.click(box.x + box.width / 2, box.y + box.height / 2), after)
}

const median = (xs: number[]): number => {
  const s = [...xs].sort((a, b) => a - b)
  return s[Math.floor(s.length / 2)]
}

test('click latency on seeded data', async () => {
  test.setTimeout(120_000 + TRIES * 150_000)
  const root = mkdtempSync(join(tmpdir(), 'cc-perf-'))
  const seeded = seed(root)
  const app = await _electron.launch({
    executablePath: ELECTRON,
    args: [MAIN, `--user-data-dir=${seeded.userData}`],
    cwd: REPO,
    env: env(seeded, join(root, 'fake.log'))
  })
  try {
    let page = await app.firstWindow()
    await page.waitForLoadState('domcontentloaded')
    await resize(app, 1440, 900)
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].webContents.setBackgroundThrottling(false))
    await startIn(page, 'atlas-api · auth', 'build the key rotation', 'Refreshing the token store')
    await startIn(page, 'pixel-forge', 'write the export presets', 'add the export preset file')
    await startIn(page, 'ledger-web', 'run the onboarding tests', 'Ran the onboarding suite')
    await startIn(page, 'notes-cli', null, null)

    const transcripts = { 'pixel-forge': longTranscript('pf'), 'ledger-web': longTranscript('lw') }
    await page.evaluate((long) => {
      const views = JSON.parse(localStorage.getItem('command-center.project-views')!).state.views as Record<string, { claudeSessions: { id: string }[] }>
      const saved = JSON.parse(localStorage.getItem('command-center.chat-items') ?? '{"state":{"items":{}},"version":1}')
      for (const [projectId, items] of Object.entries(long)) saved.state.items[views[projectId].claudeSessions[0].id] = items
      localStorage.setItem('command-center.chat-items', JSON.stringify(saved))
    }, transcripts)
    await page.reload()
    page = app.windows()[0]
    await page.waitForLoadState('domcontentloaded')
    await page.keyboard.press('Control+2')
    const list = page.getByRole('navigation', { name: 'Sessions' })
    await list.getByText('write the export presets').click()
    await expect(page.locator('[data-chat-pane]').getByText('step 149: refactor').first()).toBeAttached({ timeout: 30_000 })
    await page.waitForTimeout(1500)
    await installProbe(page)
    if (process.env.PERF_IDLE) {
      const idle = await page.evaluate(
        (ms) =>
          new Promise<number[][]>((resolve) => {
            const seen: number[][] = []
            const PO = (globalThis as unknown as { PerformanceObserver: new (cb: (list: { getEntries(): { startTime: number; duration: number }[] }) => void) => { observe(o: object): void; disconnect(): void } }).PerformanceObserver
            const po = new PO((list) => list.getEntries().forEach((e) => seen.push([Math.round(e.startTime), Math.round(e.duration)])))
            po.observe({ type: 'longtask' })
            setTimeout(() => {
              po.disconnect()
              resolve(seen)
            }, ms)
          }),
        Number(process.env.PERF_IDLE)
      )
      console.log('[idle long tasks: start ms, duration ms]', JSON.stringify(idle))
    }

    const viewTab = (name: string) => page.getByRole('tablist', { name: 'view' }).getByRole('tab', { name, exact: true })
    const pane = page.locator('[data-chat-pane]:visible').first()
    const input = page.locator('[data-chat-pane] textarea:visible').first()

    for (let i = 0; i < TRIES; i++) {
      await sample(page, 'Ctrl+1 Dashboard', 'keydown', () => page.keyboard.press('Control+1'))
      await sample(page, 'Ctrl+3 Board', 'keydown', () => page.keyboard.press('Control+3'))
      await sample(page, 'Ctrl+2 Work', 'keydown', () => page.keyboard.press('Control+2'))
      await sampleClick(page, 'click Dashboard', viewTab('Dashboard'))
      await sampleClick(page, 'click Board', viewTab('Board'))
      await sampleClick(page, 'click Work', viewTab('Work'))

      await sampleClick(page, 'open chat from Work list', list.getByText(i % 2 ? 'write the export presets' : 'run the onboarding tests'))
      await expect(pane.getByText('step 149: refactor').first()).toBeAttached()

      await sampleClick(page, 'open model menu', pane.locator('[title="Switch model"]'), () => page.keyboard.press('Escape'))
      await sampleClick(page, 'open mode menu', pane.getByRole('button', { name: /^(Manual|Edit automatically|Plan|Ask before edits)$/ }).first(), () => page.keyboard.press('Escape'))
      await input.click()
      await sample(page, 'open slash menu (type /)', 'keydown', () => input.press('/'), async () => {
        await input.press('Escape')
        await input.fill('')
      })
      await input.click()
      for (let k = 0; k < 5; k++) await sample(page, 'keystroke in prompt box', 'keydown', () => page.keyboard.press('a'))
      await input.fill('')

      await sampleClick(page, 'open Settings', page.getByRole('button', { name: 'Settings', exact: true }))
      const sections = page.getByRole('navigation', { name: 'Settings sections' }).getByRole('listitem')
      const count = await sections.count()
      for (let s = 1; s <= count; s++) {
        await sampleClick(page, 'switch Settings tab', sections.nth(s % count))
      }
      await page.keyboard.press('Escape')

      await page.keyboard.press('Control+3')
      await expect(page.getByTestId('view-board')).toBeVisible()
      await sampleClick(page, 'open board card panel', page.getByTestId('view-board').getByText('Rotate signing keys without downtime').first(), () => page.keyboard.press('Escape'))
      await page.keyboard.press('Control+2')
    }

    const rows = stats.map((s) => ({
      action: s.action,
      n: s.frames.length,
      frameMedian: Math.round(median(s.frames)),
      frameWorst: Math.round(Math.max(...s.frames)),
      settledMedian: Math.round(median(s.settled)),
      settledWorst: Math.round(Math.max(...s.settled))
    }))
    console.table(rows)
    if (process.env.PERF_OUT) writeFileSync(process.env.PERF_OUT, JSON.stringify({ rows, stats }, null, 2))
    // Loose bounds, a few times the measured medians, so only a real regression (seconds before the fix) fails.
    for (const row of rows) expect(row.frameMedian, row.action).toBeLessThan(row.action.startsWith('keystroke') ? 16 : 150)
  } finally {
    await shutdown(app)
    rmSync(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 })
  }
})
