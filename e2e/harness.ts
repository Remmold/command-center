import { execFileSync } from 'node:child_process'
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { createServer, type AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { _electron, test as base, expect, type ElectronApplication, type Page } from '@playwright/test'
import { FAKE_BIN, assertFakeClaude, assertFakeModel3d } from './guard'
import { treeOf, type ProcessRow } from './processTree'

const REPO = resolve(__dirname, '..')
const MAIN = join(REPO, 'out', 'main', 'index.js')
const ELECTRON = require('electron') as unknown as string

export const SCRIPTS = {
  basic: join(REPO, 'tools', 'fake-claude', 'scripts', 'basic.json'),
  approval: join(REPO, 'tools', 'fake-claude', 'scripts', 'approval.json'),
  slow: join(__dirname, 'scripts', 'slow.json'),
  context: join(__dirname, 'scripts', 'context.json'),
  render: join(__dirname, 'scripts', 'render.json'),
  subagent: join(__dirname, 'scripts', 'subagent.json'),
  remoteControl: join(__dirname, 'scripts', 'remote-control.json'),
  look: join(__dirname, 'scripts', 'look.json'),
  media: join(__dirname, 'scripts', 'media.json'),
  testFlow: join(__dirname, 'scripts', 'test-flow.json'),
  processes: join(__dirname, 'scripts', 'processes.json'),
  driftCheck: join(__dirname, 'scripts', 'drift-check.json'),
  proposal: join(__dirname, 'scripts', 'proposal.json')
} as const

export type ScriptName = keyof typeof SCRIPTS

export interface FakeLogEntry {
  kind: 'argv' | 'received' | 'sent' | 'spawned'
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

  /**
   * True once a fake started in `cwd` received `initialize`; the usage probe runs elsewhere and never counts.
   * With `from`, only a fake started after that many log entries counts.
   */
  initializedIn(cwd: string, from = 0): boolean {
    const entries = this.entries().slice(from)
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

  /** The text of each user message the app sent. */
  userTexts(): string[] {
    return this.entries().flatMap((e) => {
      if (e.kind !== 'received' || e.line?.type !== 'user') return []
      const content = (e.line.message as { content?: unknown } | undefined)?.content
      if (typeof content === 'string') return [content]
      if (!Array.isArray(content)) return []
      return [content.flatMap((b) => (isRecord(b) && typeof b.text === 'string' ? [b.text] : [])).join('')]
    })
  }

  /** Pids of the background servers the fake started; they outlive it. */
  spawnedPids(): number[] {
    return this.entries().flatMap((e) => (e.kind === 'spawned' && typeof e.pid === 'number' ? [e.pid] : []))
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
  /** The temp `CLAUDE_CONFIG_DIR`; transcripts live under its `projects/`. */
  configDir: string
  /** The temp folder the app reads as VS Code's `%APPDATA%\Code\User`; empty unless a test writes to it. */
  vscodeUserDir: string
  /** The test's temp root, for extra folders. */
  root: string
  /** The 3D service's jobs folder and its fake engine, worker and coord board. */
  model3d: Model3dFakes
  /** Quits the app and starts it again on the same user data, as a restart would; use the returned app and page from then on. */
  relaunch: () => Promise<{ app: ElectronApplication; page: Page }>
}

/** The CLI's permission mode as the fake started in `cwd` last heard it: its launch flag, then any later `set_permission_mode`. */
export function cliPermissionMode(log: FakeLog, cwd: string): string | undefined {
  const entries = log.entries()
  const start = entries.map((e) => e.kind === 'argv' && e.cwd === cwd).lastIndexOf(true)
  if (start === -1) return undefined
  const argv = entries[start].argv as string[]
  const flag = argv.indexOf('--permission-mode')
  const sets = entries.slice(start).flatMap((e) => {
    const request = e.kind === 'received' ? bodyOf(e, 'control_request') : undefined
    return request?.subtype === 'set_permission_mode' ? [request.mode as string] : []
  })
  return sets.at(-1) ?? (flag === -1 ? undefined : argv[flag + 1])
}

type MainFn<A, R> = (electron: typeof import('electron'), arg: A) => R | Promise<R>

/**
 * `app.evaluate` that retries Playwright's "Resulting promise was garbage collected", which Electron's main
 * process throws now and then under load. The function may already have run when it is thrown, so it must
 * be safe to run twice.
 */
export async function evaluateMain<A, R>(app: ElectronApplication, fn: MainFn<A, R>, arg: A): Promise<R> {
  for (let attempt = 1; ; attempt++) {
    try {
      return (await app.evaluate(fn as never, arg)) as R
    } catch (error) {
      if (attempt >= 5 || !String(error).includes('garbage collected')) throw error
    }
  }
}

/**
 * Holds every later `claude:start` in the app's main process for `ms`, to open the window before a chat's process
 * exists. Calling it again changes the hold; 0 ends it.
 */
export async function delayClaudeStart(app: ElectronApplication, ms: number): Promise<void> {
  await evaluateMain(app, ({ ipcMain }, wait: number) => {
    type Handler = (...args: unknown[]) => unknown
    const marked = globalThis as unknown as { __ccClaudeStartDelayMs?: number }
    const installed = marked.__ccClaudeStartDelayMs !== undefined
    marked.__ccClaudeStartDelayMs = wait
    if (installed) return
    const handlers = (ipcMain as unknown as { _invokeHandlers: Map<string, Handler> })._invokeHandlers
    const original = handlers.get('claude:start')
    if (!original) throw new Error('claude:start is not registered')
    ipcMain.removeHandler('claude:start')
    ipcMain.handle('claude:start', async (...args: unknown[]) => {
      const hold = marked.__ccClaudeStartDelayMs ?? 0
      if (hold > 0) await new Promise((r) => setTimeout(r, hold))
      return original(...args)
    })
  }, ms)
}

/** Gives every fake started from now on this script, so one launch can host chats on several scripts. */
export async function useScript(app: ElectronApplication, script: ScriptName): Promise<void> {
  await evaluateMain(app, (_electron, file: string) => {
    process.env.FAKE_CLAUDE_SCRIPT = file
  }, SCRIPTS[script])
}

const FAKES = join(__dirname, 'fakes')

export interface Model3dFakes {
  /** The app's jobs folder, where a test drops requests. */
  jobs: string
  /** The fake ComfyUI's port, free and never 8189. */
  port: number
  /** The fake gen3d.py a request names as its script, in the test root's only folder the app lets a worker come from. */
  worker: string
  /** The fake engine dir; its `calls.log` lists each POST the fake ComfyUI got. */
  engineDir: string
  /** The fake coord board's claims file. */
  coordBoard: string
  /** Where the app writes the editor's URL instead of opening a browser. */
  browserLog: string
}

/** A port nothing listens on right now. */
function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer()
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address() as AddressInfo
      server.close(() => resolve(port))
    })
  })
}

/** Copies the fake ComfyUI in as the engine's `main.py`, the fake coord board as `coord.py` and the fake worker as `gen3d.py` with its fixture, each in the test root. */
function seedModel3dFakes(root: string, userData: string, port: number): Model3dFakes {
  const engineDir = join(root, 'model3d-engine')
  const coordDir = join(root, 'model3d-coord')
  const scriptsDir = join(root, 'model3d-scripts')
  for (const dir of [engineDir, coordDir, join(scriptsDir, 'fixture')]) mkdirSync(dir, { recursive: true })
  copyFileSync(join(FAKES, 'fake_comfy.py'), join(engineDir, 'main.py'))
  copyFileSync(join(FAKES, 'fake_coord.py'), join(coordDir, 'coord.py'))
  copyFileSync(join(FAKES, 'fake_gen3d.py'), join(scriptsDir, 'gen3d.py'))
  for (const name of readdirSync(join(FAKES, 'fixture'))) copyFileSync(join(FAKES, 'fixture', name), join(scriptsDir, 'fixture', name))
  return { jobs: join(userData, 'model3d-jobs'), port, worker: join(scriptsDir, 'gen3d.py'), engineDir, coordBoard: join(coordDir, 'board.json'), browserLog: join(root, 'model3d-browser.log') }
}

function model3dEnv(fakes: Model3dFakes): Record<string, string> {
  return {
    CC_MODEL3D_ENGINE_DIR: fakes.engineDir,
    CC_MODEL3D_ENGINE_PYTHON: 'python',
    CC_MODEL3D_PORT: String(fakes.port),
    CC_MODEL3D_COORD: join(dirname(fakes.coordBoard), 'coord.py'),
    CC_MODEL3D_BROWSER_LOG: fakes.browserLog,
    CC_MODEL3D_SCRIPTS: dirname(fakes.worker),
    // Darkfall or Unity may run on this machine; the fakes' jobs must not wait on them.
    CC_MODEL3D_CLUSTER_PROCESSES: 'cc-e2e-no-cluster.exe',
    CC_MODEL3D_UNITY_PROCESSES: 'cc-e2e-no-unity.exe'
  }
}

function seedDirs(
  root: string,
  userSettings: Record<string, unknown> | null
): { userData: string; workspace: string; configDir: string; home: string; logFile: string; vscodeUserDir: string } {
  const dirs = {
    vscodeUserDir: join(root, 'vscode-user'),
    userData: join(root, 'user-data'),
    workspace: join(root, 'e2e-workspace'),
    configDir: join(root, 'claude-config'),
    home: join(root, 'home'),
    logFile: join(root, 'fake-claude.log')
  }
  for (const dir of [dirs.userData, dirs.workspace, dirs.configDir, dirs.home]) mkdirSync(dir, { recursive: true })
  writeFileSync(join(dirs.configDir, '.credentials.json'), '{}')
  if (userSettings) writeFileSync(join(dirs.configDir, 'settings.json'), JSON.stringify(userSettings))
  writeFileSync(
    join(dirs.userData, 'projects.json'),
    JSON.stringify([{ id: 'e2e-workspace', name: 'e2e-workspace', path: dirs.workspace, createdAt: Date.now() }])
  )
  return dirs
}

function appEnv(dirs: ReturnType<typeof seedDirs>, script: ScriptName, model3d: Model3dFakes, root: string, extra: Record<string, string>): Record<string, string> {
  const env: Record<string, string> = {}
  for (const [k, v] of Object.entries(process.env)) if (v !== undefined) env[k] = v
  delete env.ELECTRON_RUN_AS_NODE
  delete env.ELECTRON_RENDERER_URL
  // The runner's colour settings must not reach the app: NO_COLOR beside FORCE_COLOR makes Node print a warning into process output.
  delete env.NO_COLOR
  delete env.FORCE_COLOR
  Object.assign(env, {
    CC_CLAUDE_BIN: FAKE_BIN,
    FAKE_CLAUDE_SCRIPT: SCRIPTS[script],
    FAKE_CLAUDE_LOG: dirs.logFile,
    CLAUDE_CONFIG_DIR: dirs.configDir,
    CC_VSCODE_USER_DIR: dirs.vscodeUserDir,
    USERPROFILE: dirs.home,
    HOME: dirs.home,
    ...model3dEnv(model3d)
  })
  Object.assign(env, extra)
  assertFakeClaude(env.CC_CLAUDE_BIN)
  assertFakeModel3d(env, root)
  return env
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
      return { pid: Number(pid), parent: Number(parent), started: started ?? '' }
    })
}

/**
 * The app hides to the tray on close, so quit it, then kill whatever of its tree outlived the quit.
 * Rows match on start time too, so a reused PID is never killed.
 */
export async function shutdown(app: ElectronApplication): Promise<void> {
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

export const test = base.extend<{ script: ScriptName; userSettings: Record<string, unknown> | null; env: Record<string, string>; launched: Launched }>({
  script: ['basic', { option: true }],
  /** Written as the temp profile's `settings.json` before launch. */
  userSettings: [null, { option: true }],
  /** Extra app environment, e.g. `CC_UPDATE_IDLE_MS`; the fake CLI guard still runs after it. */
  env: [{}, { option: true }],
  launched: async ({ script, userSettings, env }, use) => {
    const root = mkdtempSync(join(tmpdir(), 'cc-e2e-'))
    /** The app works offline: the window may only load the app's own files, so any web request fails the test. */
    const online: string[] = []
    try {
      const dirs = seedDirs(root, userSettings)
      const model3d = seedModel3dFakes(root, dirs.userData, await freePort())
      const start = async (): Promise<{ app: ElectronApplication; page: Page }> => {
        const app = await _electron.launch({
          executablePath: ELECTRON,
          args: [MAIN, `--user-data-dir=${dirs.userData}`],
          cwd: REPO,
          env: appEnv(dirs, script, model3d, root, env)
        })
        await app.context().route(/^https?:\/\//, (route) => {
          // A feature's own servers on this machine are not the internet.
          if (['localhost', '127.0.0.1'].includes(new URL(route.request().url()).hostname)) return route.continue()
          online.push(route.request().url())
          return route.abort()
        })
        const page = await app.firstWindow()
        await page.waitForLoadState('domcontentloaded')
        return { app, page }
      }
      let current = await start()
      try {
        const relaunch = async () => {
          await shutdown(current.app)
          current = await start()
          return current
        }
        await use({ ...current, log: new FakeLog(dirs.logFile), workspace: dirs.workspace, configDir: dirs.configDir, vscodeUserDir: dirs.vscodeUserDir, root, model3d, relaunch })
      } finally {
        await shutdown(current.app)
      }
      expect(online, 'the window reached the internet').toEqual([])
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
  await newChatIn(page, /e2e-workspace/)
  await expect(prompt(page)).toBeVisible()
  await expect.poll(() => log.initializedIn(workspace)).toBe(true)
}

/** In the open project picker: picks the project, then its New chat. */
export async function newChatIn(page: Page, project: RegExp): Promise<void> {
  await page.getByRole('option', { name: project }).first().click()
  await page.getByRole('option', { name: 'New chat' }).click()
}

/** The folder the app lists past sessions from: Claude's per-cwd transcript folder. */
export function transcriptsOf({ configDir, workspace }: Pick<Launched, 'configDir' | 'workspace'>): string {
  return join(configDir, 'projects', workspace.replace(/[^a-zA-Z0-9]/g, '-'))
}

/** New UI tests look elements up through one of these regions, never page-wide, for any name that can repeat across regions. */
export const titleBar = (page: Page) => page.getByRole('banner', { name: 'Title bar' })
export const sessionList = (page: Page) => page.getByRole('navigation', { name: 'Sessions' })
export const chatPane = (page: Page) => page.locator('[data-chat-pane]:visible')
/** The Chat, Agents, Media, Processes and Test tabs of the shown chat. */
export const chatTabs = (page: Page) => chatPane(page).locator('[data-tab-strip]')
export const shellDrawer = (page: Page) => page.getByRole('region', { name: 'Shell drawer', exact: true })
export const processesView = (page: Page) => page.getByTestId('view-processes')
export const model3dView = (page: Page) => page.getByTestId('view-3d')

export function prompt(page: Page) {
  return page.locator('[data-chat-pane] textarea:visible:not(.xterm-helper-textarea)')
}

export async function send(page: Page, text: string): Promise<void> {
  await prompt(page).fill(text)
  await prompt(page).press('Enter')
}
