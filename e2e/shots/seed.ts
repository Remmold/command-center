import { execFileSync } from 'node:child_process'
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, dirname, join } from 'node:path'
import { expect, type ElectronApplication, type Page } from '@playwright/test'
import type { FeatureRecord } from '../../src/shared/features'
import type { Model3dRequest, Model3dStatus } from '../../src/shared/model3d'
import { formatResults, markStep, parseChecklist, resultsPathFor, type StepMarks } from '../../src/shared/testSteps'
import { FAKE_BIN, assertFakeClaude, assertFakeModel3d } from '../guard'

/**
 * Fake repos with tickets in every column, shared by the screenshot and perf runs.
 * Perf seeds must match real data sizes: Andreas's chat history was ~22.5M chars, and the earlier 1.4 MB seed hid the typing lag's cause.
 */

const HOUR = 60 * 60 * 1000

type Ticket = [number: string, title: string, status: string, blockedBy?: string]

interface Feature {
  name: string
  spec?: boolean
  tickets: Ticket[]
  notes?: string[]
  ageHours?: number
}

interface SeedRepo {
  name: string
  features: Feature[]
  /** Features written into a worktree of the repo instead of its main checkout. */
  worktree?: { tag: string; features: Feature[] }
}

const REPOS: SeedRepo[] = [
  {
    name: 'atlas-api',
    features: [
      { name: 'rate-limits', spec: true, tickets: [], ageHours: 30 },
      {
        name: 'billing-export',
        tickets: [
          ['01', 'CSV export of invoices', 'resolved'],
          ['02', 'Monthly statement email', 'wontfix']
        ],
        ageHours: 72
      }
    ],
    worktree: {
      tag: 'auth',
      features: [
        {
          name: 'auth-tokens',
          tickets: [
            ['01', 'Token store schema', 'resolved'],
            ['02', 'Refresh endpoint', 'resolved'],
            ['03', 'Rotate signing keys without downtime', 'in-progress', '01, 02'],
            ['04', 'Revoke all sessions from settings', 'ready-for-agent', '03'],
            ['05', 'Audit log for token use', 'blocked — waiting on the logging service']
          ],
          notes: ['- 01 resolved: token table and migration — a1b2c3d', '- 02 resolved: refresh endpoint with tests — d4e5f6a'],
          ageHours: 0.2
        }
      ]
    }
  },
  {
    name: 'pixel-forge',
    features: [
      {
        name: 'export-pipeline',
        tickets: [
          ['01', 'Render queue', 'resolved'],
          ['02', 'Export presets', 'in-progress', '01'],
          ['03', 'Progress toast while exporting', 'needs-triage'],
          ['04', 'Pick the default codec', 'ready-for-human'],
          ['05', 'Crash on 8K export', 'needs-info']
        ],
        notes: ['- 01 resolved: queue runs jobs one at a time — 9f8e7d6'],
        ageHours: 1.5
      }
    ]
  },
  {
    name: 'ledger-web',
    features: [
      {
        name: 'onboarding',
        tickets: [
          ['01', 'Sign-up form', 'resolved'],
          ['02', 'Email verification', 'resolved'],
          ['03', 'Welcome step and workspace picker', 'in-progress', '02'],
          ['04', 'Invite teammates', 'blocked — needs the invites API']
        ],
        notes: ['- 02 resolved: verification links expire after 24 h — 5c4b3a2'],
        ageHours: 3
      },
      {
        name: 'dark-mode',
        tickets: [
          ['01', 'Theme tokens', 'ready-for-agent'],
          ['02', 'Toggle in the header', 'ready-for-agent', '01']
        ],
        ageHours: 50
      }
    ]
  },
  {
    name: 'notes-cli',
    features: [
      {
        name: 'sync',
        tickets: [
          ['01', 'Sync over WebDAV', 'ready-for-agent'],
          ['02', 'Conflict resolution', 'needs-triage', '01']
        ],
        ageHours: 120
      }
    ]
  }
]

function git(cwd: string, ...args: string[]): void {
  execFileSync('git', args, { cwd, stdio: 'ignore' })
}

function writeAged(path: string, content: string, at: number): void {
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, content)
  utimesSync(path, at / 1000, at / 1000)
}

function writeFeatures(root: string, features: Feature[]): void {
  for (const f of features) {
    const dir = join(root, '.scratch', f.name)
    const at = Date.now() - (f.ageHours ?? 0) * HOUR
    if (f.spec) writeAged(join(dir, 'spec.md'), `# ${f.name}\n\nStatus: needs-triage\n`, at)
    for (const [number, title, status, blockedBy] of f.tickets) {
      const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/-$/, '')
      const body = `# ${number}: ${title}\n\n**Blocked by:** ${blockedBy ?? 'None'}\n\n**Status:** ${status}\n\n- [ ] ${title}\n`
      writeAged(join(dir, 'issues', `${number}-${slug}.md`), body, at)
    }
    if (f.notes) writeAged(join(dir, 'progress.md'), `${f.notes.join('\n')}\n`, at)
  }
}

export interface Seeded {
  root: string
  userData: string
  configDir: string
  home: string
  workspaces: { id: string; name: string; path: string }[]
}

/**
 * A fresh folder for a seed whose paths a shot shows: under the shared Public folder when there is one, since the temp
 * folder's path names the Windows account.
 */
export function neutralRoot(prefix: string): string {
  return mkdtempSync(join(process.env.PUBLIC && existsSync(process.env.PUBLIC) ? process.env.PUBLIC : tmpdir(), prefix))
}

export function seed(root: string): Seeded {
  const userData = join(root, 'user-data')
  const configDir = join(root, 'claude-config')
  const home = join(root, 'home')
  for (const d of [userData, configDir, home]) mkdirSync(d, { recursive: true })
  writeFileSync(join(configDir, '.credentials.json'), '{}')
  const workspaces: Seeded['workspaces'] = []
  for (const repo of REPOS) {
    const path = join(root, 'repos', repo.name)
    mkdirSync(path, { recursive: true })
    git(path, 'init', '-q', '-b', 'main')
    writeFileSync(join(path, 'README.md'), `# ${repo.name}\n`)
    git(path, 'add', '.')
    git(path, '-c', 'user.name=seed', '-c', 'user.email=seed@example.com', 'commit', '-qm', 'init')
    writeFeatures(path, repo.features)
    workspaces.push({ id: repo.name, name: repo.name, path })
    if (repo.worktree) {
      const wt = join(root, 'repos', `${repo.name}-${repo.worktree.tag}`)
      git(path, 'worktree', 'add', '-q', '-b', repo.worktree.tag, wt)
      writeFeatures(wt, repo.worktree.features)
      workspaces.push({ id: `${repo.name}-${repo.worktree.tag}`, name: `${repo.name}-${repo.worktree.tag}`, path: wt })
    }
  }
  writeFileSync(join(userData, 'board-settings.json'), JSON.stringify({ scanRoots: [join(root, 'repos')] }))
  writeFileSync(join(userData, 'projects.json'), JSON.stringify(workspaces.map((w) => ({ ...w, createdAt: Date.now() }))))
  // Unset, the app reads the real test flows folder.
  mkdirSync(join(root, 'test-flows'), { recursive: true })
  writeFileSync(join(userData, 'test-flow-settings.json'), JSON.stringify({ folder: join(root, 'test-flows') }))
  return { root, userData, configDir, home, workspaces }
}

/** The 3D service's folders, all in the seed root and empty: no engine to start, no worker to run, no coord board to read. */
function model3dEnv(root: string): Record<string, string> {
  const dir = (name: string): string => {
    const path = join(root, name)
    mkdirSync(path, { recursive: true })
    return path
  }
  return {
    CC_MODEL3D_ENGINE_DIR: dir('model3d-engine'),
    CC_MODEL3D_ENGINE_PYTHON: 'python',
    // Nothing listens on port 1, so the view reads the server as stopped; never 8189, a real ComfyUI3D's port.
    CC_MODEL3D_PORT: '1',
    CC_MODEL3D_COORD: join(dir('model3d-coord'), 'coord.py'),
    CC_MODEL3D_BROWSER_LOG: join(root, 'model3d-browser.log'),
    CC_MODEL3D_SCRIPTS: dir('model3d-scripts'),
    CC_MODEL3D_CLUSTER_PROCESSES: 'cc-shots-no-cluster.exe',
    CC_MODEL3D_UNITY_PROCESSES: 'cc-shots-no-unity.exe'
  }
}

export function env(s: Seeded, logFile: string): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(process.env)) if (v !== undefined) out[k] = v
  delete out.ELECTRON_RUN_AS_NODE
  delete out.ELECTRON_RENDERER_URL
  Object.assign(out, {
    CC_CLAUDE_BIN: FAKE_BIN,
    FAKE_CLAUDE_SCRIPT: join(__dirname, 'script.json'),
    FAKE_CLAUDE_LOG: logFile,
    CLAUDE_CONFIG_DIR: s.configDir,
    USERPROFILE: s.home,
    HOME: s.home,
    ...model3dEnv(s.root)
  })
  assertFakeClaude(out.CC_CLAUDE_BIN)
  assertFakeModel3d(out, s.root)
  return out
}

export async function startIn(page: Page, workspace: string, text: string | null, expectText: string | null): Promise<void> {
  await page.keyboard.press('Control+2')
  await page.keyboard.press('Control+t')
  // Not a worktree of the same repo, whose option starts with the repo's name too.
  await page.getByRole('option', { name: new RegExp(`^${workspace}\\b(?! ·)`) }).first().click()
  await page.getByRole('option', { name: 'New chat' }).click()
  const input = page.locator('[data-chat-pane] textarea:visible')
  await expect(input).toBeVisible()
  if (text === null) return
  await input.fill(text)
  await input.press('Enter')
  if (expectText) await expect(page.locator('[data-chat-pane]').getByText(expectText).first()).toBeVisible()
}

export async function resize(app: ElectronApplication, width: number, height: number): Promise<void> {
  await app.evaluate(({ BrowserWindow }, [w, h]) => {
    const win = BrowserWindow.getAllWindows()[0]
    win.unmaximize()
    win.setContentSize(w, h)
  }, [width, height] as const)
}


// Browser globals of the functions that run inside the page; this project compiles against Node's types.
declare const localStorage: { getItem(key: string): string | null }

const LONG_MESSAGES = 300
export const CODE = Array.from({ length: 30 }, (_, i) => `  const value${i} = await store.read('key-${i}') ?? fallback(${i}) // line ${i}`).join('\n')

/** A 300-message chat: user steps and assistant replies with a 30-line code block each. */
export function longTranscript(tag: string): unknown[] {
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

/**
 * Saves each transcript as the history of its project's first chat, plus `extraChats` copies of the first one under
 * sessions no chat shows (old sessions' history), as main's history files. Reload the page afterwards so the app reads
 * them. Returns the saved size in MB.
 */
export async function saveChats(page: Page, userData: string, byProject: Record<string, unknown[]>, extraChats = 0): Promise<number> {
  const firstChat = await page.evaluate((projects) => {
    const views = JSON.parse(localStorage.getItem('command-center.project-views')!).state.views as Record<string, { claudeSessions: { id: string }[] }>
    return projects.map((projectId) => views[projectId].claudeSessions[0].id)
  }, Object.keys(byProject))
  const dir = join(userData, 'chat-history')
  mkdirSync(dir, { recursive: true })
  let bytes = 0
  const save = (paneId: string, items: unknown[]): void => {
    const text = `${JSON.stringify({ kind: 'set', items })}
`
    writeFileSync(join(dir, `${encodeURIComponent(paneId)}.jsonl`), text)
    bytes += text.length
  }
  Object.values(byProject).forEach((items, i) => save(firstChat[i], items))
  const first = Object.values(byProject)[0]
  for (let x = 0; x < extraChats; x++) save(`seed-old-${x}`, first)
  return bytes / 1024 / 1024
}

const DAY = 24 * HOUR
const CODE_LINE = (i: number): string => `  const entry${i} = await store.read(\`key-${i}\`) ?? fallback(${i}) // keeps the old path for legacy input, line ${i}`

/**
 * Finished agents as a long, often-resumed chat leaves them: shaped like the CLI's own files (a prompt, tool calls with
 * their results, a SubagentHandback), five per turn, 0.2 to 1.2 MB each as in a real 222-agent session.
 */
export function seedFinishedAgents(subagents: string, count: number): number {
  mkdirSync(subagents, { recursive: true })
  const code = Array.from({ length: 120 }, (_, i) => CODE_LINE(i)).join('\n')
  let bytes = 0
  for (let a = 0; a < count; a++) {
    const id = `aseed${String(a).padStart(11, '0')}`
    const turn = Math.floor(a / 5)
    const start = Date.now() - 3 * DAY + turn * 20 * 60_000 + (a % 5) * 1000
    let n = 0
    const line = (type: 'user' | 'assistant', content: unknown, at: number): string =>
      JSON.stringify({ parentUuid: null, isSidechain: true, promptId: `seed-turn-${turn}`, agentId: id, type, uuid: `${id}-${++n}`, timestamp: new Date(at).toISOString(), message: { role: type, content } }) + '\n'
    const lines = [line('user', `Review ticket ${a} against its spec. Read-only: do not edit files.`, start)]
    const calls = 25 + ((a * 37) % 70)
    for (let c = 0; c < calls; c++) {
      const at = start + (c + 1) * 4000
      const tool = c % 3 === 0 ? { name: 'Bash', input: { command: `pnpm test case-${c}` } } : { name: 'Read', input: { file_path: `src/module${c}.ts` } }
      lines.push(line('assistant', [{ type: 'thinking', thinking: '', signature: 'x'.repeat(600) }, { type: 'tool_use', id: `t-${id}-${c}`, ...tool }], at))
      lines.push(line('user', [{ type: 'tool_result', tool_use_id: `t-${id}-${c}`, content: code }], at + 500))
    }
    const end = start + (calls + 2) * 4000
    const report = `Ticket ${a} matches its spec.\n\n- **Tests:** green.\n- One nit in the reader.`
    lines.push(line('assistant', [{ type: 'tool_use', id: `h-${id}`, name: 'SubagentHandback', input: { message: report } }], end))
    lines.push(line('user', [{ type: 'tool_result', tool_use_id: `h-${id}`, content: 'Report delivered to your caller.' }], end + 500))
    const text = lines.join('')
    bytes += text.length
    writeFileSync(join(subagents, `agent-${id}.meta.json`), JSON.stringify({ agentType: 'general-purpose', description: `Review ticket ${a}`, toolUseId: `toolu_seed_${a}`, finished: true }))
    writeFileSync(join(subagents, `agent-${id}.jsonl`), text)
  }
  return bytes
}

interface SeedFeature {
  repo: string
  name: string
  /** What the feature's `.scratch` folder holds; the stage is read from it. */
  files: Feature
  /** The feature's test steps, each passed or not yet marked; Testing once there are any. */
  steps?: [step: string, passed: boolean][]
  completed?: boolean
  ageHours: number
}

/** One feature per stage, each in its own worktree as New feature makes it; the Testing one has a fake server for its Test pair. */
const FEATURES: SeedFeature[] = [
  { repo: 'atlas-api', name: 'webhook-retries', files: { name: 'webhook-retries', tickets: [] }, ageHours: 0.3 },
  { repo: 'pixel-forge', name: 'batch-export', files: { name: 'batch-export', spec: true, tickets: [] }, ageHours: 2 },
  {
    repo: 'notes-cli',
    name: 'offline-mode',
    files: {
      name: 'offline-mode',
      spec: true,
      tickets: [
        ['01', 'Queue edits while offline', 'ready-for-agent'],
        ['02', 'Replay the queue on reconnect', 'ready-for-agent', '01'],
        ['03', 'Offline badge in the status line', 'needs-triage']
      ]
    },
    ageHours: 5
  },
  {
    repo: 'ledger-web',
    name: 'invoice-search',
    files: {
      name: 'invoice-search',
      spec: true,
      tickets: [
        ['01', 'Search index for invoices', 'resolved'],
        ['02', 'Search box with filters', 'in-progress', '01'],
        ['03', 'Highlight matches in results', 'ready-for-agent', '02']
      ],
      notes: ['- 01 resolved: invoices indexed by number, customer and total — 7e6d5c4']
    },
    ageHours: 8
  },
  {
    repo: 'atlas-api',
    name: 'audit-log',
    files: {
      name: 'audit-log',
      spec: true,
      tickets: [
        ['01', 'Audit table and writer', 'resolved'],
        ['02', 'Audit page with filters', 'resolved']
      ],
      notes: ['- 02 resolved: audit page lists the last 100 events — 3b2a190']
    },
    steps: [
      ['Open the audit page from the admin menu', true],
      ['See the last sign-in of the demo user at the top', true],
      ['Filter by "token revoked" and see only those rows', false]
    ],
    ageHours: 20
  },
  { repo: 'pixel-forge', name: 'color-profiles', files: { name: 'color-profiles', spec: true, tickets: [['01', 'Embed the sRGB profile on export', 'resolved']] }, completed: true, ageHours: 60 }
]

const AUDIT_ROWS = [
  ['10:42', 'demo-user', 'sign-in'],
  ['10:40', 'demo-user', 'token revoked'],
  ['09:15', 'ops-bot', 'key rotated']
]
const AUDIT_PAGE = `<title>atlas-api admin</title><body style="font-family:sans-serif;margin:2rem;background:#fff;color:#111"><h1>Audit log</h1><table border="1" cellpadding="6"><tr><th>When</th><th>Who</th><th>Event</th></tr>${AUDIT_ROWS.map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join('')}</tr>`).join('')}</table></body>`
const AUDIT_SERVER = `import http from 'node:http'\nhttp.createServer((_req, res) => {\n  res.setHeader('content-type', 'text/html')\n  res.end(${JSON.stringify(AUDIT_PAGE)})\n}).listen(Number(process.env.PORT))\n`

/**
 * Adds a feature of every stage to a seed: a worktree and workspace each, their `.scratch` files and feature records;
 * the Testing one also gets its checklist with results and a preview config whose server is a local fake page.
 */
export function seedFeatures(s: Seeded): void {
  const records: FeatureRecord[] = []
  const previews: Record<string, unknown> = {}
  for (const f of FEATURES) {
    const repo = s.workspaces.find((w) => w.id === f.repo)!
    const path = join(dirname(repo.path), `${f.repo}-worktrees`, f.name)
    git(repo.path, 'worktree', 'add', '-q', '-b', `feat/${f.name}`, path)
    writeFeatures(path, [{ ...f.files, ageHours: f.ageHours }])
    const id = `${f.repo}-${f.name}`
    s.workspaces.push({ id, name: basename(path), path })
    const startedAt = Date.now() - f.ageHours * HOUR
    records.push({ name: f.name, workspaceId: id, sourceWorkspaceId: f.repo, worktreePath: path, branch: `feat/${f.name}`, sessionId: `seed-feature-${f.name}`, ports: [], startedAt, completedAt: f.completed ? Date.now() - HOUR : null })
    if (!f.steps) continue
    const checklist = join(s.root, 'test-flows', f.repo, `${f.name}.md`)
    const results = resultsPathFor(checklist)
    const text = `Test results: ${results}\n\n${f.steps.map(([step]) => `- [ ] ${step}`).join('\n')}\n`
    writeAged(checklist, text, Date.now())
    const { steps } = parseChecklist(text)
    const marks = steps.reduce<StepMarks>((acc, step, i) => (f.steps![i][1] ? markStep(acc, step.hash, 'pass') : acc), {})
    writeFileSync(results, formatResults(f.name, steps, marks))
    writeFileSync(join(path, 'server.mjs'), AUDIT_SERVER)
    previews[f.repo] = { install: '', startPage: '/', servers: [{ name: 'admin', command: 'node server.mjs', cwd: '.', ready: 'port' }] }
  }
  writeFileSync(join(s.userData, 'features.json'), JSON.stringify(records))
  writeFileSync(join(s.userData, 'preview-configs.json'), JSON.stringify(previews))
  writeFileSync(join(s.userData, 'projects.json'), JSON.stringify(s.workspaces.map((w) => ({ ...w, createdAt: Date.now() }))))
}

/**
 * Finished 3D jobs as the 3D service leaves them in its jobs folder: a done one with the fake fixture's model, a failed
 * and a cancelled one. Finished jobs load as history, so no server or worker starts.
 */
export function seed3dJobs(s: Seeded): void {
  const forge = s.workspaces.find((w) => w.id === 'pixel-forge')!.path
  const out = join(forge, 'generated3d')
  mkdirSync(out, { recursive: true })
  const fixture = join(__dirname, '..', 'fakes', 'fixture')
  for (const [from, to] of [['model.glb', 'lantern.glb'], ['model_sheet.png', 'lantern_sheet.png'], ['model.json', 'lantern.json']]) copyFileSync(join(fixture, from), join(out, to))
  const jobs = join(s.userData, 'model3d-jobs')
  mkdirSync(jobs, { recursive: true })
  const at = (minutesAgo: number): string => new Date(Date.now() - minutesAgo * 60_000).toISOString()
  const job = (name: string, minutesAgo: number, status: Partial<Model3dStatus>): void => {
    const id = `seed-${name}`
    const request: Model3dRequest = {
      id,
      kind: 'generate',
      argv: ['--image', `${name}.png`, '--name', name, '--out', out],
      cwd: forge,
      python: 'python',
      script: join(s.root, 'model3d-scripts', 'gen3d.py'),
      waiterPid: 0,
      wait: true,
      sessionId: '',
      configDir: '',
      submittedAt: at(minutesAgo),
      summary: `${name}.png · prop`,
      runAnyway: false
    }
    const done: Model3dStatus = { state: 'done', waitReason: null, progress: null, startedAt: at(minutesAgo - 1), endedAt: at(minutesAgo - 4), error: null, outputs: [] }
    writeFileSync(join(jobs, `${id}.request.json`), JSON.stringify(request))
    writeFileSync(join(jobs, `${id}.status.json`), JSON.stringify({ ...done, ...status }))
  }
  job('lantern', 12, { outputs: [{ glb: join(out, 'lantern.glb'), sheet: join(out, 'lantern_sheet.png'), json: join(out, 'lantern.json') }] })
  job('anvil', 40, { state: 'failed', error: 'The worker ended with code 1: the picture has no clear subject.' })
  job('banner', 90, { state: 'cancelled', error: 'Cancelled in Command Center' })
}

/** A made-up CLAUDE.md and settings in atlas-api, and the account's own CLAUDE.md, for the Context view. */
export function seedContext(s: Seeded): void {
  const atlas = s.workspaces.find((w) => w.id === 'atlas-api')!.path
  const rules = [
    '# atlas-api',
    '',
    'HTTP API for the Atlas billing product: accounts, invoices, tokens and webhooks.',
    '',
    '## Commands',
    '',
    '- `pnpm dev`: the API on localhost:4100 with a seeded demo database',
    '- `pnpm test`: unit and route tests',
    '- `pnpm db:migrate`: apply migrations to the local database',
    '',
    '## Conventions',
    '',
    '- Every route validates its input with the shared schema module.',
    '- Tokens are never logged; the audit log stores their id only.',
    '- New migrations are additive; a column is dropped one release after its last reader.'
  ]
  writeFileSync(join(atlas, 'CLAUDE.md'), `${rules.join('\n')}\n`)
  mkdirSync(join(atlas, '.claude'), { recursive: true })
  writeFileSync(join(atlas, '.claude', 'settings.json'), JSON.stringify({ permissions: { allow: ['Bash(pnpm test:*)', 'Bash(pnpm dev)'] } }, null, 2))
  writeFileSync(join(s.configDir, 'CLAUDE.md'), '# Working style\n\n- Explain the plan in two sentences before a large change.\n- Run the quick tests before every commit.\n')
}
