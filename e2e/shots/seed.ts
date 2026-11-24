import { execFileSync } from 'node:child_process'
import { mkdirSync, utimesSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { expect, type ElectronApplication, type Page } from '@playwright/test'
import { FAKE_BIN, assertFakeClaude } from '../guard'

/** Fake repos with tickets in every column, shared by the screenshot and perf runs. */

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
  userData: string
  configDir: string
  home: string
  workspaces: { id: string; name: string; path: string }[]
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
  return { userData, configDir, home, workspaces }
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
    HOME: s.home
  })
  assertFakeClaude(out.CC_CLAUDE_BIN)
  return out
}

export async function startIn(page: Page, workspace: string, text: string | null, expectText: string | null): Promise<void> {
  await page.keyboard.press('Control+2')
  await page.keyboard.press('Control+t')
  await page.getByRole('option', { name: new RegExp(`^${workspace}\\b`) }).first().click()
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
