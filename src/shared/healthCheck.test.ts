import { describe, expect, it } from 'vitest'
import type { ContextItem, ContextItemKind, ContextReport, MemoryIndexFacts } from './context'
import { healthCheck } from './healthCheck'

const MEM = '/acc/projects/ws/memory'

function item(kind: ContextItemKind, label: string, extra: Partial<ContextItem> = {}): ContextItem {
  return { kind, label, note: null, path: `${MEM}/${label}`, source: 'account', tokens: null, missing: false, sharedWithDefault: false, readOnly: null, children: [], ...extra }
}

/** MEMORY.md with these line lengths in bytes, breaks included. */
function index(lineBytes: number[], extra: Partial<MemoryIndexFacts> = {}): ContextItem {
  let end = 0
  const lineEnds = lineBytes.map((b) => (end += b))
  return item('memory-index', 'MEMORY.md', { tokens: 10, index: { lines: lineEnds.length, bytes: end, lineEnds, links: [], missingTargets: [], ...extra }, unmatchedLinks: [] })
}

const lines = (n: number, bytes = 20): number[] => Array.from({ length: n }, () => bytes)

function report(account: ContextItem[], repo: ContextItem[] = []): ContextReport {
  return { workspacePath: '/ws', accountFolder: '/acc', memoryFolder: MEM, folderExists: true, layers: { account, repo, local: [] }, startTotal: 0, missing: [], docs: [] }
}

describe('healthCheck: MEMORY.md past what Claude loads', () => {
  it('finds nothing in a MEMORY.md of 200 lines', () => {
    expect(healthCheck(report([index(lines(200))]))).toEqual([])
  })

  it('reports a MEMORY.md of 201 lines once, naming line 201 as the first cut off and 1 line lost', () => {
    const findings = healthCheck(report([index(lines(201))]))
    expect(findings).toHaveLength(1)
    expect(findings[0]).toMatchObject({ path: `${MEM}/MEMORY.md`, verdict: 'structural', severity: 'problem', status: 'open' })
    expect(findings[0].claim).toContain('from line 201 on')
    expect(findings[0].claim).toContain('1 line is cut off')
  })

  it('finds nothing in a MEMORY.md of exactly 25,600 bytes', () => {
    expect(healthCheck(report([index([...lines(99, 256), 256])]))).toEqual([])
  })

  it('reports a MEMORY.md of 25,601 bytes, cut at the line that crosses 25,600 bytes', () => {
    const findings = healthCheck(report([index([...lines(99, 256), 257])]))
    expect(findings).toHaveLength(1)
    expect(findings[0].claim).toContain('from line 100 on')
    expect(findings[0].claim).toContain('1 line is cut off')
    expect(findings[0].evidence).toContain('25,601 bytes')
  })

  it('names the earlier cut when both limits are past, as on a 225-line index of 32 KB', () => {
    const findings = healthCheck(report([index(lines(225, 160))]))
    expect(findings).toHaveLength(1)
    expect(findings[0].claim).toContain('MEMORY.md is 225 lines')
    expect(findings[0].claim).toContain('from line 161 on')
    expect(findings[0].claim).toContain('65 lines are cut off')
  })
})

describe('healthCheck: memory files and index lines', () => {
  it('reports each memory file MEMORY.md never links, on that file', () => {
    const findings = healthCheck(report([index(lines(3)), item('memory-file', 'a.md', { indexed: true }), item('memory-file', 'b.md', { indexed: false }), item('memory-file', 'c.md', { indexed: false })]))
    expect(findings.map((f) => [f.path, f.verdict, f.severity])).toEqual([
      [`${MEM}/b.md`, 'structural', 'problem'],
      [`${MEM}/c.md`, 'structural', 'problem']
    ])
    expect(findings[0].claim).toContain('b.md')
  })

  it('reports each index line whose target is missing, on MEMORY.md', () => {
    const findings = healthCheck(
      report([
        index(lines(9), {
          missingTargets: [
            { line: 4, target: 'gone.md' },
            { line: 9, target: 'old/x.md' }
          ]
        })
      ])
    )
    expect(findings.map((f) => f.path)).toEqual([`${MEM}/MEMORY.md`, `${MEM}/MEMORY.md`])
    expect(findings[0].claim).toContain('gone.md')
    expect(findings[0].evidence).toContain('Line 4')
    expect(findings[1].claim).toContain('old/x.md')
  })
})

describe('healthCheck: CLAUDE.md size', () => {
  it('finds nothing at 40,000 characters and reports 40,001, in any layer and any import', () => {
    const findings = healthCheck(
      report(
        [item('claude-md', 'CLAUDE.md', { path: '/acc/CLAUDE.md', chars: 40_000, children: [item('import', '@big.md', { path: '/acc/big.md', chars: 40_001 })] })],
        [item('claude-md', 'CLAUDE.md', { path: '/ws/CLAUDE.md', chars: 40_001 }), item('subfolder-claude-md', 'src/CLAUDE.md', { path: '/ws/src/CLAUDE.md', chars: 50_000 })]
      )
    )
    expect(findings.map((f) => [f.path, f.severity])).toEqual([
      ['/acc/big.md', 'problem'],
      ['/ws/CLAUDE.md', 'problem'],
      ['/ws/src/CLAUDE.md', 'problem']
    ])
    expect(findings[1].claim).toContain('40,001 characters')
  })
})

describe('healthCheck: [[links]]', () => {
  it('lists each unmatched [[link]] as a note on the file it is in, never as a problem', () => {
    const findings = healthCheck(report([{ ...index(lines(2)), unmatchedLinks: ['later-idea'] }, item('memory-file', 'a.md', { indexed: true, unmatchedLinks: ['x', 'y'] })]))
    expect(findings.map((f) => [f.path, f.severity])).toEqual([
      [`${MEM}/MEMORY.md`, 'note'],
      [`${MEM}/a.md`, 'note'],
      [`${MEM}/a.md`, 'note']
    ])
    expect(findings[0].claim).toContain('[[later-idea]]')
  })
})

describe('healthCheck: ids', () => {
  it('gives every finding an H- id of its rule, the same on every run and unique in the report', () => {
    const r = report([
      { ...index(lines(201), { missingTargets: [{ line: 3, target: 'gone.md' }] }), unmatchedLinks: ['n'] },
      item('memory-file', 'a.md', { indexed: false, unmatchedLinks: ['n'] }),
      item('memory-file', 'b.md', { indexed: false })
    ])
    const first = healthCheck(r).map((f) => f.id)
    expect(healthCheck(structuredClone(r)).map((f) => f.id)).toEqual(first)
    expect(new Set(first).size).toBe(first.length)
    expect(first.map((id) => id.replace(/-[0-9a-z]+$/, ''))).toEqual(['H-memory-long', 'H-missing-target', 'H-unmatched-link', 'H-unindexed', 'H-unmatched-link', 'H-unindexed'])
  })
})
