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
    return start !== -1 && entries.slice(start).some((e) => e.kind === 'received' && (e.line?.request as { subtype?: string } | undefined)?.subtype === 'initialize')
  }

  /** The `request` bodies of control requests the app sent with this subtype. */
  controlRequests(subtype: string): Record<string, unknown>[] {
    return this.entries().flatMap((e) => {
      const line = e.kind === 'received' ? e.line : undefined
      const request = line?.type === 'control_request' ? (line.request as Record<string, unknown> | undefined) : undefined
      return request?.subtype === subtype ? [request] : []
    })
  }

  /** The app's answers to the fake's `can_use_tool` requests. */
  approvalReplies(): Record<string, unknown>[] {
    return this.entries().flatMap((e) => {
      const line = e.kind === 'received' ? e.line : undefined
      if (line?.type !== 'control_response') return []
      const reply = (line.response as { response?: Record<string, unknown> } | undefined)?.response
      return reply && 'behavior' in reply ? [reply] : []
    })
  }

  toolPrompts(): number {
    return this.entries().filter((e) => e.kind === 'sent' && (e.line?.request as { subtype?: string } | undefined)?.subtype === 'can_use_tool').length
  }
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

/** The app hides to the tray on close, so quit it, then kill the tree if it lingers. */
async function shutdown(app: ElectronApplication): Promise<void> {
  const proc = app.process()
  const pid = proc.pid
  await Promise.race([app.close().catch(() => undefined), new Promise((r) => setTimeout(r, 5000))])
  if (pid !== undefined && proc.exitCode === null && proc.signalCode === null) {
    try {
      execFileSync('taskkill', ['/PID', String(pid), '/T', '/F'], { stdio: 'ignore' })
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
