import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { _electron, test as base, expect, type ElectronApplication, type Page } from '@playwright/test'
import { FAKE_BIN, assertFakeClaude } from './guard'

const REPO = resolve(__dirname, '..')
const MAIN = join(REPO, 'out', 'main', 'index.js')
const ELECTRON = require('electron') as unknown as string

export const SCRIPTS = {
  basic: join(REPO, 'tools', 'fake-claude', 'scripts', 'basic.json'),
  approval: join(REPO, 'tools', 'fake-claude', 'scripts', 'approval.json'),
  slow: join(__dirname, 'scripts', 'slow.json')
} as const

export type ScriptName = keyof typeof SCRIPTS

export interface FakeLogEntry {
  kind: 'argv' | 'received' | 'sent'
  line?: Record<string, unknown>
  [key: string]: unknown
}

export class FakeLog {
  constructor(readonly file: string) {}

  entries(): FakeLogEntry[] {
    if (!existsSync(this.file)) return []
    return readFileSync(this.file, 'utf-8')
      .split('\n')
      .filter((l) => l.trim())
      .map((l) => JSON.parse(l) as FakeLogEntry)
  }

  /** True once a fake started in `cwd` received `initialize`; the usage probe runs elsewhere and never counts. */
  initializedIn(cwd: string): boolean {
    const entries = this.entries()
    const start = entries.findIndex((e) => e.kind === 'argv' && e.cwd === cwd)
    return start !== -1 && entries.slice(start).some((e) => e.kind === 'received' && bodyOf(e, 'control_request')?.subtype === 'initialize')
  }

  /** The `request` bodies of control requests the app sent with this subtype. */
  controlRequests(subtype: string): Record<string, unknown>[] {
    return this.entries().flatMap((e) => {
      const request = e.kind === 'received' ? bodyOf(e, 'control_request') : undefined
      return request?.subtype === subtype ? [request] : []
    })
  }

  /** The app's answers to the fake's `can_use_tool` requests. */
  approvalReplies(): Record<string, unknown>[] {
    return this.entries().flatMap((e) => {
      const reply = e.kind === 'received' ? bodyOf(e, 'control_response')?.response : undefined
      return isRecord(reply) && 'behavior' in reply ? [reply] : []
    })
  }

  toolPrompts(): number {
    return this.entries().filter((e) => e.kind === 'sent' && bodyOf(e, 'control_request')?.subtype === 'can_use_tool').length
  }
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null

/** `request` of a control_request line, `response` of a control_response line. */
function bodyOf(entry: FakeLogEntry, type: 'control_request' | 'control_response'): Record<string, unknown> | undefined {
  if (entry.line?.type !== type) return undefined
  const body = entry.line[type === 'control_request' ? 'request' : 'response']
  return isRecord(body) ? body : undefined
}

interface Launched {
  app: ElectronApplication
  page: Page
  log: FakeLog
  workspace: string
}

function seedDirs(root: string): { userData: string; workspace: string; configDir: string; home: string; logFile: string } {
  const dirs = {
    userData: join(root, 'user-data'),
    workspace: join(root, 'e2e-workspace'),
    configDir: join(root, 'claude-config'),
    home: join(root, 'home'),
    logFile: join(root, 'fake-claude.log')
  }
  for (const dir of [dirs.userData, dirs.workspace, dirs.configDir, dirs.home]) mkdirSync(dir, { recursive: true })
  writeFileSync(join(dirs.configDir, '.credentials.json'), '{}')
  writeFileSync(
    join(dirs.userData, 'projects.json'),
    JSON.stringify([{ id: 'e2e-workspace', name: 'e2e-workspace', path: dirs.workspace, createdAt: Date.now() }])
  )
  return dirs
}

function appEnv(dirs: ReturnType<typeof seedDirs>, script: ScriptName): Record<string, string> {
  const env: Record<string, string> = {}
  for (const [k, v] of Object.entries(process.env)) if (v !== undefined) env[k] = v
  delete env.ELECTRON_RUN_AS_NODE
  delete env.ELECTRON_RENDERER_URL
  Object.assign(env, {
    CC_CLAUDE_BIN: FAKE_BIN,
    FAKE_CLAUDE_SCRIPT: SCRIPTS[script],
    FAKE_CLAUDE_LOG: dirs.logFile,
    CLAUDE_CONFIG_DIR: dirs.configDir,
    USERPROFILE: dirs.home,
    HOME: dirs.home
  })
  assertFakeClaude(env.CC_CLAUDE_BIN)
  return env
}

interface ProcessRow {
  pid: number
  parent: number
  started: string
}

function processTable(): ProcessRow[] {
  const out = execFileSync(
    'powershell.exe',
    ['-NoProfile', '-Command', 'Get-CimInstance Win32_Process | ForEach-Object { "$($_.ProcessId) $($_.ParentProcessId) $($_.CreationDate.Ticks)" }'],
    { encoding: 'utf-8' }
  )
  return out
    .split(/\r?\n/)
    .filter((l) => l.trim())
    .map((l) => {
      const [pid, parent, started] = l.trim().split(' ')
      return { pid: Number(pid), parent: Number(parent), started }
    })
}

function treeOf(root: number, table: ProcessRow[]): ProcessRow[] {
  const tree = table.filter((p) => p.pid === root)
  for (let i = 0; i < tree.length; i++) tree.push(...table.filter((p) => p.parent === tree[i].pid && p.pid !== tree[i].pid))
  return tree
}

/**
 * The app hides to the tray on close, so quit it, then kill whatever of its tree outlived the quit.
 * Rows match on start time too, so a reused PID is never killed.
 */
async function shutdown(app: ElectronApplication): Promise<void> {
  const pid = app.process().pid
  const tree = pid === undefined ? [] : treeOf(pid, processTable())
  await Promise.race([app.close().catch(() => undefined), new Promise((r) => setTimeout(r, 5000))])
  const running = processTable()
  for (const p of tree) {
    if (!running.some((r) => r.pid === p.pid && r.started === p.started)) continue
    try {
      execFileSync('taskkill', ['/PID', String(p.pid), '/F'], { stdio: 'ignore' })
    } catch {
      // Already gone between the check and the kill.
    }
  }
}

export const test = base.extend<{ script: ScriptName; launched: Launched }>({
  script: ['basic', { option: true }],
  launched: async ({ script }, use) => {
    const root = mkdtempSync(join(tmpdir(), 'cc-e2e-'))
    try {
      const dirs = seedDirs(root)
      const app = await _electron.launch({
        executablePath: ELECTRON,
        args: [MAIN, `--user-data-dir=${dirs.userData}`],
        cwd: REPO,
        env: appEnv(dirs, script)
      })
      try {
        const page = await app.firstWindow()
        await page.waitForLoadState('domcontentloaded')
        await use({ app, page, log: new FakeLog(dirs.logFile), workspace: dirs.workspace })
      } finally {
        await shutdown(app)
      }
    } finally {
      rmSync(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 })
    }
  }
})

export { expect }

/** Opens Work and starts a session in the seeded workspace; resolves once its fake process got `initialize`. */
export async function startSession({ page, log, workspace }: Launched): Promise<void> {
  await page.keyboard.press('Control+2')
  await page.keyboard.press('Control+t')
  await page.getByRole('option', { name: /e2e-workspace/ }).first().click()
  await expect(prompt(page)).toBeVisible()
  await expect.poll(() => log.initializedIn(workspace)).toBe(true)
}

export function prompt(page: Page) {
  return page.locator('[data-chat-pane] textarea')
}

export async function send(page: Page, text: string): Promise<void> {
  await prompt(page).fill(text)
  await prompt(page).press('Enter')
}

/** Picks a permission mode from the footer's mode menu. */
export async function chooseMode(page: Page, current: string, next: string): Promise<void> {
  await page.locator('[data-chat-pane]').getByRole('button', { name: current, exact: true }).click()
  await page.getByRole('menuitemradio', { name: new RegExp(`^${next}`) }).click()
}
