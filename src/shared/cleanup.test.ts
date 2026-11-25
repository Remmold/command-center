import { describe, expect, it } from 'vitest'
import { buildCleanup, type CleanupInput } from './cleanup'
import type { ContextItem, ContextItemKind, ContextReport, ContextSource } from './context'

const APP = 'C:\\projects\\app'
const ACCOUNT = 'C:\\Users\\me\\.claude'
const MEMORY = `${ACCOUNT}\\projects\\C--projects-app\\memory`

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

function projectRun(report: ContextReport = appReport()): CleanupInput {
  return {
    kind: 'project',
    sessionPath: report.workspacePath,
    account: { name: 'Work', folder: ACCOUNT, items: report.layers.account },
    projects: [{ name: 'app', report }]
  }
}

describe('cleanup prompt: this project', () => {
  it("names the repo and local CLAUDE.md files, their imports, subfolder CLAUDE.md files, the repo's skills, agents and commands, the memory folder and the docs", () => {
    const { prompt } = buildCleanup(projectRun())

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
    const { prompt } = buildCleanup(projectRun())

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
    const { prompt } = buildCleanup(projectRun(appReport({ docs: [] })))

    expect(prompt).not.toContain('GLOSSARY.md')
    expect(prompt).not.toContain('docs\\adr')
    expect(prompt).not.toContain('docs\\agents')
  })

  it('pre-allows only the memory folder: the workspace and the files inside it are already reachable', () => {
    expect(buildCleanup(projectRun()).addDirs).toEqual([MEMORY])
  })

  it('never adds the session workspace, whatever the case or slashes of its path', () => {
    const inside = appReport({ memoryFolder: 'c:/projects/APP/.memory/' })

    expect(buildCleanup({ ...projectRun(inside), sessionPath: 'C:\\Projects\\app\\' }).addDirs).toEqual([])
  })

  it('adds a folder once even when it is named twice', () => {
    const run = projectRun()

    expect(buildCleanup({ ...run, projects: [...run.projects, ...run.projects] }).addDirs).toEqual([MEMORY])
  })

  it('tells Claude to send one subagent per project, check every claim, report a findings table and ask before editing', () => {
    const { prompt } = buildCleanup(projectRun())

    expect(prompt).toContain('one subagent per project')
    expect(prompt).toMatch(/current code and git history/)
    expect(prompt).toMatch(/stale, wrong, duplicate, structural or fine/)
    expect(prompt).toMatch(/clickable questions/)
    expect(prompt).toMatch(/Edit nothing before I answer/)
    expect(prompt).not.toMatch(/account files/i)
  })

  it('runs the steps in order: subagents, findings table, questions', () => {
    const { prompt } = buildCleanup(projectRun())
    const at = (text: string): number => prompt.indexOf(text)

    expect(at('one subagent per project')).toBeLessThan(at('findings table'))
    expect(at('findings table')).toBeLessThan(at('clickable questions'))
  })
})
