import { describe, expect, it } from 'vitest'
import { buildDriftCheck, driftRunSkeleton, type DriftCheckInput } from './driftCheck'
import type { ContextItem, ContextItemKind, ContextReport, ContextSource } from './context'

const APP = 'C:\\projects\\app'
const ACCOUNT = 'C:\\Users\\me\\.claude'
const MEMORY = `${ACCOUNT}\\projects\\C--projects-app\\memory`
const FINDINGS = 'C:\\Users\\me\\AppData\\Roaming\\command-center\\drift-checks'
const RUN_FILE = `${FINDINGS}\\2026-11-25-a1b2.json`

function item(kind: ContextItemKind, path: string | null, source: ContextSource, children: ContextItem[] = []): ContextItem {
  return { kind, label: path ?? kind, note: null, path, source, tokens: null, missing: false, sharedWithDefault: false, readOnly: null, children }
}

function appReport(over: Partial<ContextReport> = {}): ContextReport {
  return {
    workspacePath: APP,
    accountFolder: ACCOUNT,
    memoryFolder: MEMORY,
    folderExists: true,
    layers: {
      account: [
        item('claude-md', `${ACCOUNT}\\CLAUDE.md`, 'account', [item('import', `${ACCOUNT}\\rules.md`, 'account')]),
        item('memory-index', `${MEMORY}\\MEMORY.md`, 'account'),
        item('skill', `${ACCOUNT}\\skills\\flow\\SKILL.md`, 'account'),
        item('settings', `${ACCOUNT}\\settings.json`, 'account')
      ],
      repo: [
        item('claude-md', 'C:\\projects\\CLAUDE.md', 'repo'),
        item('claude-md', `${APP}\\CLAUDE.md`, 'repo', [item('import', `${APP}\\docs\\style.md`, 'repo', [item('import', `${APP}\\docs\\deep.md`, 'repo')])]),
        item('skill', `${APP}\\.claude\\skills\\ship\\SKILL.md`, 'repo'),
        item('agent', `${APP}\\.claude\\agents\\reviewer.md`, 'repo'),
        item('command', `${APP}\\.claude\\commands\\gate.md`, 'repo'),
        item('plugin', 'C:\\plugins\\kit\\.claude-plugin\\plugin.json', 'repo', [item('skill', 'C:\\plugins\\kit\\skills\\tdd\\SKILL.md', 'plugin:kit')]),
        item('mcp-server', `${APP}\\.mcp.json`, 'repo'),
        item('settings', `${APP}\\.claude\\settings.json`, 'repo'),
        item('subfolder-claude-md', `${APP}\\src\\CLAUDE.md`, 'repo')
      ],
      local: [item('claude-md', `${APP}\\CLAUDE.local.md`, 'repo'), item('settings', `${APP}\\.claude\\settings.local.json`, 'repo')]
    },
    startTotal: 0,
    missing: [],
    docs: [`${APP}\\GLOSSARY.md`, `${APP}\\docs\\adr`],
    ...over
  }
}

function projectRun(report: ContextReport = appReport()): DriftCheckInput {
  return {
    kind: 'project',
    sessionPath: report.workspacePath,
    account: { name: 'Work', folder: ACCOUNT, items: report.layers.account },
    projects: [{ name: 'app', report }],
    findingsFile: RUN_FILE
  }
}

describe('drift-check prompt: this project', () => {
  it("names the repo and local CLAUDE.md files, their imports, subfolder CLAUDE.md files, the repo's skills, agents and commands, the memory folder and the docs", () => {
    const { prompt } = buildDriftCheck(projectRun())

    for (const path of [
      'C:\\projects\\CLAUDE.md',
      `${APP}\\CLAUDE.md`,
      `${APP}\\docs\\style.md`,
      `${APP}\\docs\\deep.md`,
      `${APP}\\CLAUDE.local.md`,
      `${APP}\\src\\CLAUDE.md`,
      `${APP}\\.claude\\skills\\ship\\SKILL.md`,
      `${APP}\\.claude\\agents\\reviewer.md`,
      `${APP}\\.claude\\commands\\gate.md`,
      MEMORY,
      `${APP}\\GLOSSARY.md`,
      `${APP}\\docs\\adr`
    ]) {
      expect(prompt).toContain(path)
    }
  })

  it('leaves out the account files, plugin items, servers and settings', () => {
    const { prompt } = buildDriftCheck(projectRun())

    for (const path of [
      `${ACCOUNT}\\CLAUDE.md`,
      `${ACCOUNT}\\rules.md`,
      `${ACCOUNT}\\skills\\flow\\SKILL.md`,
      `${ACCOUNT}\\settings.json`,
      'C:\\plugins\\kit',
      `${APP}\\.mcp.json`,
      `${APP}\\.claude\\settings.json`,
      `${APP}\\.claude\\settings.local.json`
    ]) {
      expect(prompt).not.toContain(path)
    }
  })

  it('names the glossary and the ADR folder only when the workspace has them', () => {
    const { prompt } = buildDriftCheck(projectRun(appReport({ docs: [] })))

    expect(prompt).not.toContain('GLOSSARY.md')
    expect(prompt).not.toContain('docs\\adr')
    expect(prompt).not.toContain('docs\\agents')
  })

  it('pre-allows the memory folder and the findings folder: the workspace and the files inside it are already reachable', () => {
    expect(buildDriftCheck(projectRun()).addDirs).toEqual([MEMORY, FINDINGS])
  })

  it('never adds the session workspace, whatever the case or slashes of its path', () => {
    const inside = appReport({ memoryFolder: 'c:/projects/APP/.memory/' })

    expect(buildDriftCheck({ ...projectRun(inside), sessionPath: 'C:\\Projects\\app\\' }).addDirs).toEqual([FINDINGS])
  })

  it('adds a folder once even when it is named twice', () => {
    const run = projectRun()

    expect(buildDriftCheck({ ...run, projects: [...run.projects, ...run.projects] }).addDirs).toEqual([MEMORY, FINDINGS])
  })

  it('tells Claude to send one subagent per project, check every claim, and leave every context file as it is', () => {
    const { prompt } = buildDriftCheck(projectRun())

    expect(prompt).toContain('one subagent per project')
    expect(prompt).toMatch(/current code and git history/)
    expect(prompt).toMatch(/Edit no context file until I ask you to fix findings/)
    expect(prompt).not.toMatch(/account files/i)
  })

  it('names the findings file and its schema, with every field the map reads', () => {
    const { prompt } = buildDriftCheck(projectRun())

    expect(prompt).toContain(`Findings file: ${RUN_FILE}`)
    for (const part of [
      '"version": 1',
      '"steps": [{ "id": string, "title": string, "status": "pending" | "running" | "done" }]',
      '"verdict": "stale" | "wrong" | "duplicate" | "structural"',
      '"severity": "problem" | "note"',
      '"status": "open" | "applied" | "skipped"',
      '"claim": string',
      '"evidence": string',
      '"fix": string',
      '"done": boolean'
    ]) {
      expect(prompt).toContain(part)
    }
  })

  it('has the steps set first, one per subagent, then each step updated and its findings appended as its subagent reports, then done', () => {
    const { prompt } = buildDriftCheck(projectRun())
    const at = (text: string): number => prompt.indexOf(text)

    expect(prompt).toMatch(/one step per subagent/)
    expect(at('one step per subagent')).toBeLessThan(at('one subagent per project'))
    expect(at('one subagent per project')).toBeLessThan(at('As each subagent reports'))
    expect(prompt).toMatch(/As each subagent reports, set its step to "done" and append its findings/)
    expect(at('As each subagent reports')).toBeLessThan(at('"done": true'))
  })

  it('has fixes applied only when asked, each finding marked applied or skipped', () => {
    const { prompt } = buildDriftCheck(projectRun())

    expect(prompt).toMatch(/When I ask you to fix findings, apply only those and set each one's "status" to "applied" or "skipped"/)
  })
})

function accountRun(report: ContextReport = appReport()): DriftCheckInput {
  return { ...projectRun(report), kind: 'account', projects: [] }
}

describe('drift-check prompt: account', () => {
  it("names the account's CLAUDE.md and its imports, skills, agents, commands and settings, and no project files", () => {
    const { prompt } = buildDriftCheck(accountRun())

    for (const path of [`${ACCOUNT}\\CLAUDE.md`, `${ACCOUNT}\\rules.md`, `${ACCOUNT}\\skills\\flow\\SKILL.md`, `${ACCOUNT}\\settings.json`]) {
      expect(prompt).toContain(path)
    }
    for (const path of [`${APP}\\CLAUDE.md`, `${APP}\\.claude\\skills\\ship\\SKILL.md`, MEMORY, `${APP}\\GLOSSARY.md`]) {
      expect(prompt).not.toContain(path)
    }
  })

  it('leaves out plugin items, servers and memory in the account layer', () => {
    const report = appReport()
    const account = [
      ...report.layers.account,
      item('agent', `${ACCOUNT}\\plugins\\cache\\kit\\agents\\helper.md`, 'plugin:kit'),
      item('plugin', `${ACCOUNT}\\plugins\\cache\\kit\\.claude-plugin\\plugin.json`, 'account'),
      item('mcp-server', `${ACCOUNT}.json`, 'account')
    ]
    const { prompt } = buildDriftCheck({ ...accountRun(report), account: { name: 'Work', folder: ACCOUNT, items: account } })

    expect(prompt).not.toContain('plugins\\cache\\kit')
    expect(prompt).not.toContain(`${ACCOUNT}.json`)
    expect(prompt).not.toContain(MEMORY)
  })

  it('pre-allows the account folder and the findings folder', () => {
    expect(buildDriftCheck(accountRun()).addDirs).toEqual([ACCOUNT, FINDINGS])
  })

  it('sends one subagent for the account files and says an account-file fix reaches every workspace of the account', () => {
    const { prompt } = buildDriftCheck(accountRun())

    expect(prompt).toContain('one subagent for the account files')
    expect(prompt).toMatch(/shared by every workspace of the account/)
    expect(prompt.indexOf('one subagent')).toBeLessThan(prompt.indexOf('shared by every workspace'))
  })
})

const WEB = 'D:\\code\\web'
const WEB_MEMORY = `${ACCOUNT}\\projects\\D--code-web\\memory`

function webReport(): ContextReport {
  return appReport({
    workspacePath: WEB,
    memoryFolder: WEB_MEMORY,
    layers: {
      account: appReport().layers.account,
      repo: [item('claude-md', `${WEB}\\CLAUDE.md`, 'repo'), item('skill', `${WEB}\\.claude\\skills\\deploy\\SKILL.md`, 'repo')],
      local: []
    },
    docs: [`${WEB}\\docs\\agents`]
  })
}

function crossRun(): DriftCheckInput {
  return { ...projectRun(), kind: 'cross-project', projects: [{ name: 'app', report: appReport() }, { name: 'web', report: webReport() }] }
}

describe('drift-check prompt: across projects', () => {
  it("names every covered workspace's files and memory folder, plus the account files", () => {
    const { prompt } = buildDriftCheck(crossRun())

    for (const path of [
      `${APP}\\CLAUDE.md`,
      MEMORY,
      `${WEB}\\CLAUDE.md`,
      `${WEB}\\.claude\\skills\\deploy\\SKILL.md`,
      `${WEB}\\docs\\agents`,
      WEB_MEMORY,
      `${ACCOUNT}\\CLAUDE.md`,
      `${ACCOUNT}\\settings.json`
    ]) {
      expect(prompt).toContain(path)
    }
  })

  it("pre-allows the other workspaces, every memory folder, the account folder and the findings folder, each once, never the session's own workspace", () => {
    const run = crossRun()
    const { addDirs } = buildDriftCheck({ ...run, projects: [...run.projects, run.projects[1]] })

    expect(addDirs).toEqual([MEMORY, WEB, WEB_MEMORY, ACCOUNT, FINDINGS])
  })

  it('asks for one subagent per project plus one for the account files', () => {
    const { prompt } = buildDriftCheck(crossRun())

    expect(prompt).toContain('one subagent per project listed above, plus one for the account files')
    expect(prompt).toMatch(/shared by every workspace of the account/)
  })
})

describe('drift-check skeleton', () => {
  it('names the scope, session, start, account and covered workspaces, with no steps or findings yet', () => {
    const at = new Date('2026-11-25T10:00:00.000Z')

    expect(driftRunSkeleton({ ...crossRun(), runId: 'r1', sessionId: 'pane-1', startedAt: at })).toEqual({
      version: 1,
      check: 'drift',
      scope: 'cross-project',
      runId: 'r1',
      sessionId: 'pane-1',
      startedAt: '2026-11-25T10:00:00.000Z',
      accountFolder: ACCOUNT,
      workspaces: [APP, WEB],
      steps: [],
      findings: [],
      done: false
    })
  })

  it('covers no workspace in an account run', () => {
    expect(driftRunSkeleton({ ...accountRun(), runId: 'r2', sessionId: 'pane-2', startedAt: new Date(0) }).workspaces).toEqual([])
  })
})
