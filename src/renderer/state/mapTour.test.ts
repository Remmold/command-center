import { describe, expect, it } from 'vitest'
import type { ContextItem, ContextItemKind, ContextLayerName, ContextReport } from '../../shared/context'
import { healthCheck } from '../../shared/healthCheck'
import { blocksOf, mapLayout, type ContextMap } from './mapLayout'
import { findingTarget, stepIndex, tourSteps, type TourStep } from './mapTour'

function item(kind: ContextItemKind, label: string, extra: Partial<ContextItem> = {}): ContextItem {
  return {
    kind,
    label,
    note: null,
    path: `/x/${label}`,
    source: 'account',
    tokens: null,
    missing: false,
    sharedWithDefault: false,
    readOnly: null,
    children: [],
    ...extra
  }
}

function report(layers: Partial<Record<ContextLayerName, ContextItem[]>>): ContextReport {
  return {
    workspacePath: '/ws',
    accountFolder: '/acc',
    memoryFolder: '/acc/projects/ws/memory',
    folderExists: true,
    layers: { account: [], repo: [], local: [], ...layers },
    startTotal: 0,
    missing: [],
    docs: []
  }
}

const memoryFile = (n: number, indexed: boolean): ContextItem => item('memory-file', `m${n}.md`, { indexed })

/** A workspace like Andreas's: account and repo CLAUDE.md files, a long MEMORY.md, some unlinked memory, skills, agents, commands and MCP servers. */
function workspace(): ContextReport {
  const lines = 210
  const lineEnds = Array.from({ length: lines }, (_, i) => (i + 1) * 20)
  return report({
    account: [
      item('claude-md', 'CLAUDE.md', { tokens: 2100, chars: 8400 }),
      item('skill', 'grill', { tokens: 30 }),
      item('skill', 'tdd', { tokens: 20 }),
      item('skill', 'implement', { note: 'slash command only' }),
      item('agent', 'reviewer', { tokens: 50 }),
      item('command', 'ship'),
      item('settings', 'settings.json', { children: [item('hook', 'PreToolUse')] }),
      item('mcp-server', 'db'),
      item('mcp-server', 'slack')
    ],
    repo: [
      item('claude-md', 'repo CLAUDE.md', { tokens: 1500, chars: 6000, children: [item('import', 'docs/rules.md', { tokens: 300 })] }),
      item('memory-index', 'MEMORY.md', {
        tokens: 280,
        index: { lines, bytes: lines * 20, lineEnds, links: ['/x/m1.md', '/x/m2.md'], missingTargets: [] }
      }),
      memoryFile(1, true),
      memoryFile(2, true),
      memoryFile(3, false),
      memoryFile(4, false),
      memoryFile(5, false),
      item('command', 'release')
    ],
    local: [item('claude-md', 'CLAUDE.local.md', { tokens: 10, chars: 40 }), item('mcp-server', 'local-db')]
  })
}

function steps(r: ContextReport = workspace()): TourStep[] {
  const health = healthCheck(r)
  return tourSteps(mapLayout(r, health), health)
}

const labels = (map: ContextMap, s: TourStep): string[] => blocksOf(map).filter((b) => s.highlight.has(b.id)).map((b) => b.label)

const step = (id: TourStep['id'], r?: ContextReport): TourStep => steps(r).find((s) => s.id === id)!

describe('tourSteps', () => {
  it('has the six steps in order', () => {
    expect(steps().map((s) => s.title)).toEqual([
      'What every chat starts with',
      'Memory',
      'Skills, agents & commands',
      'Settings, hooks & MCP',
      'Health check',
      'Drift check'
    ])
  })

  it('step 1 says what every chat starts with, by layer', () => {
    expect(step('start').text[0]).toBe('Every chat here starts with ~4.3k tokens: ~2.2k from Account, ~2.1k from Repo and ~10 from Local.')
  })

  it('step 1 highlights the Every start band', () => {
    const map = mapLayout(workspace(), [])
    const start = tourSteps(map, [])[0]
    expect([...start.highlight].sort()).toEqual(
      blocksOf(map)
        .filter((b) => b.band === 'start')
        .map((b) => b.id)
        .sort()
    )
    expect(labels(map, start)).toContain('docs/rules.md')
    expect(labels(map, start)).not.toContain('m1.md')
  })

  it('step 2 counts the memory files and those MEMORY.md never links', () => {
    expect(step('memory').text).toEqual([
      'MEMORY.md is 210 lines (~280 tokens at every start) and links 2 of 5 memory files.',
      '3 memory files are not linked from MEMORY.md, so Claude never finds them.'
    ])
    const map = mapLayout(workspace(), [])
    expect(labels(map, tourSteps(map, [])[1]).sort()).toEqual(['MEMORY.md', 'm1.md', 'm2.md', 'm3.md', 'm4.md', 'm5.md'])
  })

  it('step 2 says when there is no memory yet', () => {
    expect(step('memory', report({})).text).toEqual(['This workspace has no MEMORY.md yet, so Claude starts with no memory index.'])
  })

  it('step 3 counts skills, agents and commands, and what their names cost at start', () => {
    expect(step('skills').text).toEqual([
      'This workspace has 3 skills, 1 agent and 2 commands.',
      'Their names and descriptions add ~100 tokens to every start; the rest loads only when one is used.',
      '1 skill is offered only as a slash command, so nothing of it loads until you type it.'
    ])
    const map = mapLayout(workspace(), [])
    expect(labels(map, tourSteps(map, [])[2]).sort()).toEqual(['grill', 'implement', 'release', 'reviewer', 'ship', 'tdd'])
  })

  it('step 4 counts settings files, hooks, MCP servers and plugins, which cost no tokens', () => {
    expect(step('behaviour').text[0]).toBe('This workspace has 1 settings file, 1 hook, 3 MCP servers and no plugins.')
    const map = mapLayout(workspace(), [])
    expect(labels(map, tourSteps(map, [])[3]).sort()).toEqual(['PreToolUse', 'db', 'local-db', 'settings.json', 'slack'])
  })

  it('explains each kind its step is about', () => {
    expect(step('memory').kinds).toEqual(['memory-index', 'memory-file'])
    expect(step('skills').kinds).toEqual(['skill', 'agent', 'command'])
  })

  it('step 5 lists the health findings, findings first, then notes', () => {
    const r = workspace()
    r.layers.repo[2] = memoryFile(1, true)
    r.layers.repo[2].unmatchedLinks = ['later']
    const health = step('health', r)
    expect(health.text[0]).toBe('The health check found 4 findings and 1 note, free and instant, every time the map is drawn.')
    expect(health.findings.map((f) => f.severity)).toEqual(['problem', 'problem', 'problem', 'problem', 'note'])
    expect(health.findings[0].claim).toMatch(/^MEMORY\.md is 210 lines/)
  })

  it('step 5 lights the blocks with findings', () => {
    const r = workspace()
    const health = healthCheck(r)
    const map = mapLayout(r, health)
    expect(labels(map, tourSteps(map, health)[4]).sort()).toEqual(['MEMORY.md', 'm3.md', 'm4.md', 'm5.md'])
  })

  it('step 5 says when the health check found nothing', () => {
    expect(step('health', report({ repo: [item('claude-md', 'CLAUDE.md', { tokens: 10, chars: 40 })] })).text).toEqual([
      'The health check found nothing to fix, free and instant, every time the map is drawn.'
    ])
  })

  it('step 6 explains what a drift check does and lights the files it reads', () => {
    const map = mapLayout(workspace(), [])
    const drift = tourSteps(map, [])[5]
    expect(drift.text.join(' ')).toMatch(/costs tokens/)
    expect(labels(map, drift)).toContain('repo CLAUDE.md')
    expect(labels(map, drift)).toContain('MEMORY.md')
    expect(labels(map, drift)).not.toContain('db')
  })

  it('step 5 counts only notes when there are no findings', () => {
    const r = report({
      repo: [item('memory-index', 'MEMORY.md', { tokens: 5, unmatchedLinks: ['a', 'b'], index: { lines: 1, bytes: 9, lineEnds: [9], links: [], missingTargets: [] } })]
    })
    expect(step('health', r).text[0]).toBe('The health check found 2 notes, free and instant, every time the map is drawn.')
  })

  it('step 5 lists health findings only, not other findings on the blocks', () => {
    const r = workspace()
    const health = healthCheck(r)
    const drift = { ...health[0], id: 'F1', claim: 'drifted' }
    const s = tourSteps(mapLayout(r, [...health, drift]), health)[4]
    expect(s.findings.map((f) => f.id)).not.toContain('F1')
    expect(s.findings).toHaveLength(health.length)
  })

  it('step 2 says when MEMORY.md links no memory files yet', () => {
    const r = report({ repo: [item('memory-index', 'MEMORY.md', { tokens: 5, index: { lines: 3, bytes: 9, lineEnds: [3, 6, 9], links: [], missingTargets: [] } })] })
    expect(step('memory', r).text).toEqual(['MEMORY.md is 3 lines (~5 tokens at every start) and links no memory files yet.'])
  })

  it('step 1 explains CLAUDE.md files and their imports', () => {
    expect(step('start').kinds).toEqual(['claude-md', 'import'])
  })

  it('only step 5 lists findings', () => {
    expect(steps().filter((s) => s.findings.length > 0).map((s) => s.id)).toEqual(['health'])
  })
})

describe('stepIndex', () => {
  it('keeps the step within the steps', () => {
    expect([-1, 0, 5, 9].map((n) => stepIndex(n, steps()))).toEqual([0, 0, 5, 5])
  })
})

describe('findingTarget', () => {
  it('selects the block a finding is on', () => {
    const r = workspace()
    const health = healthCheck(r)
    const long = health.find((f) => f.claim.startsWith('MEMORY.md is'))!
    const target = findingTarget(r, health, [], long.id)
    const map = mapLayout(r, health)
    expect(target?.expand).toBeNull()
    expect(blocksOf(map).find((b) => b.id === target?.blockId)?.label).toBe('MEMORY.md')
  })

  it('expands a collapsed group to select the one file a finding is on', () => {
    const r = workspace()
    r.layers.repo.push(...Array.from({ length: 9 }, (_, i) => memoryFile(10 + i, false)))
    const health = healthCheck(r)
    const one = health.find((f) => f.path === '/x/m14.md')!
    const target = findingTarget(r, health, [], one.id)!
    expect(target.expand).toMatch(/group/)
    const map = mapLayout(r, health, new Set([target.expand!]))
    expect(blocksOf(map).find((b) => b.id === target.blockId)?.label).toBe('m14.md')
  })

  it('is null for a finding on no block', () => {
    expect(findingTarget(workspace(), [], [], 'H-x')).toBeNull()
  })
})
