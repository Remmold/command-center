import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { _electron, expect, test, type Page } from 'C:/projects/personal/command-center/node_modules/@playwright/test'
import { shutdown } from 'C:/projects/personal/command-center/e2e/harness'
import { env, resize, seed, startIn } from 'C:/projects/personal/command-center/e2e/shots/seed'

const REPO = 'C:/projects/personal/command-center'
const MAIN = join(REPO, 'out', 'main', 'index.js')
const ELECTRON = require(join(REPO, 'node_modules', 'electron')) as unknown as string
const KEYS = Number(process.env.KEYS ?? 60)
const EXTRA_CHATS = Number(process.env.EXTRA_CHATS ?? 0)

const CODE = Array.from({ length: 30 }, (_, i) => `  const value${i} = await store.read('key-${i}') ?? fallback(${i}) // line ${i}`).join('\n')
function longTranscript(tag: string, n = 300): unknown[] {
  const items: unknown[] = []
  for (let i = 0; i < n / 2; i++) {
    const at = Date.now() - (n - i) * 60_000
    items.push({ kind: 'user', id: `${tag}-u${i}`, text: `step ${i}: refactor the reader for case ${i}`, at })
    const text = [`Here is step **${i}**. The reader keeps \`offset\`.`, '', `- checked case ${i}`, '', '```ts', `export async function read${i}(store: Store): Promise<number> {`, CODE, '  return value0', '}', '```', '', 'Tests pass.'].join('\n')
    const message = { id: `${tag}-m${i}`, role: 'assistant', content: [{ type: 'text', text }] }
    items.push({ kind: 'assistant', id: `${tag}-a${i}`, content: message.content, raw: { type: 'assistant', message }, at })
  }
  return items
}

// A long streamed reply: prose + code fences, 3-word deltas every 20 ms.
const para = (i: number) => `Paragraph ${i} explains how the reader keeps its offset and why the store returns early on an empty file, with \`inline\` code too.\n\n\`\`\`ts\n${CODE.split('\n').slice(0, 8).join('\n')}\n\`\`\`\n\n`
const streamText = Array.from({ length: 25 }, (_, i) => para(i)).join('')
function script(): string {
  const base = JSON.parse(readFileSync(join(REPO, 'e2e', 'shots', 'script.json'), 'utf8')) as { turns: unknown[] }
  const events: unknown[] = []
  for (let k = 0; k < 6; k++) {
    events.push({ type: 'text', text: streamText })
    events.push({ type: 'tool_use', name: 'Read', input: { file_path: '{cwd}{sep}README.md' }, approval: false, result: 'x'.repeat(20000) })
  }
  base.turns.unshift({ match: '^stream', repeat: true, deltaDelayMs: 20, events })
  const commits: unknown[] = []
  for (let k = 0; k < 40; k++) {
    commits.push({ type: 'text', text: `Step ${k}: reading the next file to check the offset handling.` })
    commits.push({ type: 'tool_use', name: 'Read', input: { file_path: '{cwd}{sep}README.md' }, approval: false, result: 'y'.repeat(4000), delayMs: 1000 })
  }
  base.turns.unshift({ match: '^commits', repeat: true, deltaDelayMs: 20, events: commits })
  return JSON.stringify(base)
}

interface Probe {
  addEventListener(type: string, l: (e: { type: string; timeStamp: number }) => void, c: boolean): void
  __perfArm?: (type: string) => void
  __perfResult?: () => Promise<{ frame: number; settled: number }>
  __io?: { reset(): void; read(): Record<string, number> }
}
declare const window: Probe
declare const localStorage: { getItem(key: string): string | null; setItem(key: string, value: string): void }
declare function requestAnimationFrame(cb: () => void): number

async function installProbe(page: Page): Promise<void> {
  await page.evaluate(() => {
    let pending: Promise<{ frame: number; settled: number }> | null = null
    let armed: string | null = null
    let res: ((r: { frame: number; settled: number }) => void) | null = null
    const onEvent = (e: { type: string; timeStamp: number }): void => {
      if (e.type !== armed || !res) return
      armed = null
      const done = res
      res = null
      const t0 = e.timeStamp
      requestAnimationFrame(() => setTimeout(() => done({ frame: performance.now() - t0, settled: 0 }), 0))
    }
    window.addEventListener('keydown', onEvent, true)
    window.__perfArm = (t) => {
      armed = t
      pending = new Promise((r) => (res = r))
    }
    window.__perfResult = () => pending!
    // Instrument localStorage writes and JSON.stringify (by key / size), plus long tasks.
    const S = (globalThis as any).Storage.prototype
    const orig = S.setItem
    const J = JSON.stringify
    const c: Record<string, number> = {}
    const add = (k: string, v: number) => (c[k] = (c[k] ?? 0) + v)
    S.setItem = function (k: string, v: string) {
      const t = performance.now()
      orig.call(this, k, v)
      const d = performance.now() - t
      add(`set#${k}`, 1)
      add(`setMs#${k}`, d)
      add(`KB#${k}`, v.length / 1024)
      if (d > (c[`setMaxMs#${k}`] ?? 0)) c[`setMaxMs#${k}`] = d
    }
    ;(JSON as any).stringify = function (...a: unknown[]) {
      const t = performance.now()
      const r = (J as any).apply(JSON, a)
      const d = performance.now() - t
      if (d > 1) add('stringify>1ms', 1), add('stringifyMs(>1ms)', d)
      return r
    }
    const PO = (globalThis as any).PerformanceObserver
    new PO((l: any) => l.getEntries().forEach((e: any) => (add('longtasks', 1), add('longtaskMs', e.duration), e.duration > (c.longtaskMax ?? 0) && (c.longtaskMax = e.duration)))).observe({ type: 'longtask' })
    window.__io = { reset: () => Object.keys(c).forEach((k) => delete c[k]), read: () => ({ ...c }) }
  })
}

const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)]
const pct = (xs: number[], p: number) => [...xs].sort((a, b) => a - b)[Math.min(xs.length - 1, Math.floor(xs.length * p))]

async function typeRun(page: Page, label: string, rows: unknown[]): Promise<void> {
  const input = page.locator('[data-chat-pane] textarea:visible').first()
  const tc = Date.now()
  await page.evaluate(() => (document as any).querySelector('[data-chat-pane]:not([aria-hidden]) textarea, [data-chat-pane] textarea')?.focus())
  await input.focus({ timeout: 60_000 })
  console.log(`[${label}] focusing took ${Date.now() - tc} ms`)
  await page.evaluate(() => window.__io!.reset())
  const t0 = Date.now()
  const xs: number[] = []
  for (let k = 0; k < KEYS; k++) {
    await page.evaluate(() => window.__perfArm!('keydown'))
    await page.keyboard.press('a')
    xs.push((await page.evaluate(() => window.__perfResult!())).frame)
    await page.waitForTimeout(40)
  }
  const secs = (Date.now() - t0) / 1000
  const io = await page.evaluate(() => window.__io!.read())
  await input.fill('', { timeout: 60_000 })
  const per = Object.fromEntries(Object.entries(io).map(([k, v]) => [k, k.startsWith('setMax') || k === 'longtaskMax' ? Math.round(v) : Math.round((v / secs) * 10) / 10]))
  rows.push({ label, median: Math.round(median(xs)), p90: Math.round(pct(xs, 0.9)), worst: Math.round(Math.max(...xs)), over50: xs.filter((x) => x > 50).length })
  console.log(`[${label}] per-second rates (max values raw):`, JSON.stringify(per))
}

test('typing while streaming', async () => {
  test.setTimeout(600_000)
  const root = mkdtempSync(join(tmpdir(), 'cc-typing-'))
  const seeded = seed(root)
  const scriptPath = join(root, 'script.json')
  writeFileSync(scriptPath, script())
  const e = env(seeded, join(root, 'fake.log'))
  e.FAKE_CLAUDE_SCRIPT = scriptPath
  const app = await _electron.launch({ executablePath: ELECTRON, args: [MAIN, `--user-data-dir=${seeded.userData}`], cwd: REPO, env: e })
  const rows: unknown[] = []
  try {
    let page = await app.firstWindow()
    await page.waitForLoadState('domcontentloaded')
    await resize(app, 1440, 900)
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].webContents.setBackgroundThrottling(false))
    await startIn(page, 'pixel-forge', 'hello', null)
    await startIn(page, 'ledger-web', 'hello', null)
    await startIn(page, 'notes-cli', 'hello', null)
    await page.waitForTimeout(1500)
    await page.evaluate(
      ({ n, extra }) => {
        const views = JSON.parse(localStorage.getItem('command-center.project-views')!).state.views as Record<string, { claudeSessions: { id: string }[] }>
        const saved = JSON.parse(localStorage.getItem('command-center.chat-items')!)
        const ids = ['pixel-forge', 'ledger-web'].map((p) => views[p].claudeSessions[0].id)
        ids.forEach((id, i) => (saved.state.items[id] = (n as any)[i]))
        for (let x = 0; x < extra; x++) saved.state.items[`dead-${x}`] = (n as any)[0]
        localStorage.setItem('command-center.chat-items', JSON.stringify(saved))
      },
      { n: [longTranscript('pf'), longTranscript('lw')], extra: EXTRA_CHATS }
    )
    await page.reload()
    page = app.windows()[0]
    await page.waitForLoadState('domcontentloaded')
    await page.keyboard.press('Control+2')
    const list = page.getByRole('navigation', { name: 'Sessions' })
    await list.getByText(/^hello$/i).first().waitFor()
    const size = await page.evaluate(() => (localStorage.getItem('command-center.chat-items') ?? '').length / 1024 / 1024)
    console.log(`[chat-items] ${size.toFixed(2)} MB chars`)
    await installProbe(page)
    const sessions = list.getByText(/^hello$/i)
    let longIdx = 0
    for (let i = 0; i < 3; i++) {
      await sessions.nth(i).click()
      await page.waitForTimeout(400)
      if (await page.locator('[data-chat-pane]:visible').first().getByText('step 149: refactor').count()) { longIdx = i; break }
    }
    const otherIdx = longIdx === 0 ? 1 : 0
    await page.waitForTimeout(1000)
    const pane = page.locator('[data-chat-pane]:visible').first()
    await typeRun(page, 'idle', rows)

    // (a) The chat on screen streams.
    const input = page.locator('[data-chat-pane] textarea:visible').first()
    await input.fill('stream it')
    await input.press('Enter')
    await expect(pane.getByText('Paragraph 3').first()).toBeVisible({ timeout: 30_000 })
    await typeRun(page, 'visible long chat streaming, early', rows)
    await typeRun(page, 'visible long chat streaming, later', rows)
    await typeRun(page, 'visible long chat streaming, later 2', rows)

    if (process.env.ONLY_COMMITS) rows.length = 0
    // Direct cost of one chat-items persist at the current size.
    const cost = await page.evaluate(() => {
      const k = 'command-center.chat-items'
      const o = JSON.parse(localStorage.getItem(k)!)
      const out: number[][] = []
      for (let i = 0; i < 3; i++) {
        const t0 = performance.now(); const s = JSON.stringify(o); const t1 = performance.now(); localStorage.setItem(k, s); out.push([Math.round(t1 - t0), Math.round(performance.now() - t1)])
      }
      return out
    })
    console.log('[persist cost: stringify ms, setItem ms]', JSON.stringify(cost))
    await sessions.nth(longIdx).click()
    await page.waitForTimeout(300)
    await input.fill('stop')
    await page.keyboard.press('Escape')
    await page.waitForTimeout(1500)
    await input.fill('commits please')
    await input.press('Enter')
    await expect(pane.getByText('Step 2:').first()).toBeVisible({ timeout: 90_000 })
    await typeRun(page, 'visible chat committing items (tool calls)', rows)
    // (b) Another chat on screen, the first keeps streaming in the background.
    await sessions.nth(otherIdx).click()
    await page.waitForTimeout(500)
    await typeRun(page, 'other chat streaming in background', rows)
    console.table(rows)
  } finally {
    await shutdown(app)
    try { rmSync(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }) } catch {}
    console.table(rows)
  }
})
