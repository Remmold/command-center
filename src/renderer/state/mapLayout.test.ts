import { describe, expect, it } from 'vitest'
import { SLASH_COMMAND_ONLY, type ContextItem, type ContextItemKind, type ContextLayerName, type ContextReport } from '../../shared/context'
import type { Finding } from '../../shared/findings'
import { BLOCK_SIZE_FLOOR, blocksOf, mapLayout, type ContextMap, type MapBandName } from './mapLayout'

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

function report(layers: Partial<Record<ContextLayerName, ContextItem[]>>, startTotal = 0): ContextReport {
  return {
    workspacePath: '/ws',
    accountFolder: '/acc',
    memoryFolder: '/acc/projects/ws/memory',
    folderExists: true,
    layers: { account: [], repo: [], local: [], ...layers },
    startTotal,
    missing: [],
    docs: []
  }
}

function band(map: ContextMap, layer: ContextLayerName, name: MapBandName): string[] {
  const lane = map.lanes.find((l) => l.layer === layer)
  return lane?.bands.find((b) => b.band === name)?.blocks.map((b) => b.label) ?? []
}

function many(kind: ContextItemKind, n: number): ContextItem[] {
  return Array.from({ length: n }, (_, i) => item(kind, `${kind}-${i + 1}`))
}

describe('mapLayout', () => {
  it('draws the three layers as lanes in the order they apply, each with the three bands', () => {
    const map = mapLayout(report({}), [])
    expect(map.lanes.map((l) => l.layer)).toEqual(['account', 'repo', 'local'])
    for (const lane of map.lanes) expect(lane.bands.map((b) => b.band)).toEqual(['start', 'on-demand', 'behaviour'])
  })

  it('puts each kind in its band: what loads at every start, on demand, and what only shapes behaviour', () => {
    const map = mapLayout(
      report({
        account: [
          item('claude-md', 'CLAUDE.md', { tokens: 100 }),
          item('memory-index', 'MEMORY.md', { tokens: 40 }),
          item('memory-file', 'a.md'),
          item('skill', 'grill', { tokens: 20 }),
          item('agent', 'reviewer', { tokens: 10 }),
          item('command', 'ship'),
          item('settings', 'settings.json'),
          item('hook', 'PreToolUse'),
          item('mcp-server', 'db'),
          item('plugin', 'tools@market')
        ],
        repo: [item('claude-md', 'repo CLAUDE.md', { tokens: 50 }), item('subfolder-claude-md', 'src/CLAUDE.md')]
      }),
      []
    )
    expect(band(map, 'account', 'start')).toEqual(['CLAUDE.md', 'MEMORY.md', 'grill', 'reviewer'])
    expect(band(map, 'account', 'on-demand')).toEqual(['a.md', 'ship'])
    expect(band(map, 'account', 'behaviour')).toEqual(['settings.json', 'PreToolUse', 'db', 'tools@market'])
    expect(band(map, 'repo', 'start')).toEqual(['repo CLAUDE.md'])
    expect(band(map, 'repo', 'on-demand')).toEqual(['src/CLAUDE.md'])
  })

  it("puts a settings file's hooks in Behaviour and a plugin's skills in Every start", () => {
    const map = mapLayout(
      report({
        account: [
          item('settings', 'settings.json', { children: [item('hook', 'Stop')] }),
          item('plugin', 'kit@market', { children: [item('skill', 'kit-skill', { tokens: 12 }), item('command', 'kit-cmd')] })
        ]
      }),
      []
    )
    expect(band(map, 'account', 'start')).toEqual(['kit-skill'])
    expect(band(map, 'account', 'on-demand')).toEqual(['kit-cmd'])
    expect(band(map, 'account', 'behaviour')).toEqual(['settings.json', 'Stop', 'kit@market'])
    expect(map.edges).toEqual([])
  })

  it('sizes a block by its tokens, with a floor for items that count nothing', () => {
    const map = mapLayout(report({ account: [item('claude-md', 'CLAUDE.md', { tokens: 1200 }), item('claude-md', 'tiny', { tokens: 3 }), item('memory-file', 'a.md')] }), [])
    const blocks = map.lanes[0].bands.flatMap((b) => b.blocks)
    expect(blocks.map((b) => [b.label, b.tokens, b.size])).toEqual([
      ['CLAUDE.md', 1200, 1200],
      ['tiny', 3, BLOCK_SIZE_FLOOR],
      ['a.md', null, BLOCK_SIZE_FLOOR]
    ])
  })

  it('keeps 8 items of a kind as 8 blocks', () => {
    const map = mapLayout(report({ account: many('memory-file', 8) }), [])
    expect(band(map, 'account', 'on-demand')).toHaveLength(8)
    expect(map.lanes[0].bands[1].blocks.every((b) => !b.collapsed && b.groupId === null)).toBe(true)
  })

  it('draws more than 8 items of a kind as one block, with their summed tokens, until the group is expanded', () => {
    const skills = many('skill', 9).map((s) => ({ ...s, tokens: 10 }))
    const collapsed = mapLayout(report({ repo: skills }), [])
    const [group] = collapsed.lanes[1].bands[0].blocks
    expect(collapsed.lanes[1].bands[0].blocks).toHaveLength(1)
    expect(group).toMatchObject({ label: '9 skills', collapsed: true, item: null, tokens: 90, size: 90 })
    expect(group.items).toHaveLength(9)
    expect(collapsed.groups).toMatchObject([{ id: group.id, label: '9 skills', layer: 'repo', band: 'start', tokens: 90, expanded: false }])

    const open = mapLayout(report({ repo: skills }), [], new Set([group.id]))
    expect(band(open, 'repo', 'start')).toEqual(skills.map((s) => s.label))
    expect(open.lanes[1].bands[0].blocks.every((b) => b.groupId === group.id && !b.collapsed)).toBe(true)
    expect(open.groups).toMatchObject([{ id: group.id, expanded: true }])
  })

  it('draws a line from each CLAUDE.md to the files it imports, nested imports included', () => {
    const map = mapLayout(
      report({
        account: [
          item('claude-md', 'CLAUDE.md', {
            path: '/acc/CLAUDE.md',
            tokens: 100,
            children: [item('import', '@rules.md', { path: '/acc/rules.md', tokens: 30, children: [item('import', '@deep.md', { path: '/acc/deep.md', tokens: 5 })] })]
          })
        ]
      }),
      []
    )
    expect(band(map, 'account', 'start')).toEqual(['CLAUDE.md', '@rules.md', '@deep.md'])
    const label = (id: string): string | undefined => map.lanes[0].bands[0].blocks.find((b) => b.id === id)?.label
    expect(map.edges.map((e) => [label(e.from), label(e.to), e.kind])).toEqual([
      ['CLAUDE.md', '@rules.md', 'import'],
      ['@rules.md', '@deep.md', 'import']
    ])
  })

  it('counts every start band to the same start total Files shows', () => {
    const layers = {
      account: [
        item('claude-md', 'CLAUDE.md', { tokens: 100, children: [item('import', '@a.md', { tokens: 30 })] }),
        item('memory-index', 'MEMORY.md', { tokens: 40 }),
        item('plugin', 'kit', { children: [item('skill', 'kit-skill', { tokens: 12 })] })
      ],
      repo: [item('claude-md', 'repo', { tokens: 50 }), ...many('skill', 10).map((s) => ({ ...s, tokens: 2 }))],
      local: [item('claude-md', 'CLAUDE.local.md', { tokens: 7 })]
    }
    const map = mapLayout(report(layers, 259), [])
    const starts = map.lanes.map((l) => l.bands[0].tokens)
    expect(starts).toEqual([182, 70, 7])
    expect(map.startTotal).toBe(259)
    expect(map.lanes.every((l) => l.bands[2].tokens === null)).toBe(true)
  })

  it('marks blocks shared with Personal and read-only ones, a group only when all its items are', () => {
    const memory = many('memory-file', 9).map((m) => ({ ...m, sharedWithDefault: true }))
    const map = mapLayout(
      report({ account: [item('claude-md', 'CLAUDE.md', { sharedWithDefault: true, readOnly: 'adopted' }), ...memory, item('memory-file', 'own.md')] }),
      []
    )
    const blocks = map.lanes[0].bands.flatMap((b) => b.blocks)
    expect(blocks.map((b) => [b.label, b.sharedWithDefault, b.readOnly])).toEqual([
      ['CLAUDE.md', true, 'adopted'],
      ['10 memory files', false, null]
    ])
  })

  it("groups a plugin's items apart from the layer's own, as Files lists them", () => {
    const plugin = item('plugin', 'kit', { source: 'plugin:kit', children: many('skill', 5).map((s) => ({ ...s, source: 'plugin:kit' as const })) })
    const map = mapLayout(report({ account: [...many('skill', 5), plugin] }), [])
    expect(band(map, 'account', 'start')).toHaveLength(10)
    expect(map.groups).toEqual([])

    const big = mapLayout(report({ account: [...many('skill', 9), plugin] }), [])
    expect(band(big, 'account', 'start')).toEqual(['9 skills', 'skill-1', 'skill-2', 'skill-3', 'skill-4', 'skill-5'])
  })

  it('puts a skill offered only as a slash command On demand, since nothing of it loads at start', () => {
    const map = mapLayout(report({ account: [item('skill', 'grill', { tokens: 20 }), item('skill', 'release', { note: SLASH_COMMAND_ONLY }), item('command', 'ship')] }), [])
    expect(band(map, 'account', 'start')).toEqual(['grill'])
    expect(band(map, 'account', 'on-demand')).toEqual(['ship', 'release'])
  })

  it('draws a line from MEMORY.md to each memory file it links, and to a collapsed group of them once', () => {
    const files = (n: number): ContextItem[] => many('memory-file', n).map((m) => ({ ...m, indexed: true }))
    const index = (links: ContextItem[]): ContextItem => item('memory-index', 'MEMORY.md', { tokens: 40, index: { lines: 2, bytes: 9, lineEnds: [4, 9], links: links.map((l) => l.path as string), missingTargets: [] } })
    const few = files(2)
    const small = mapLayout(report({ account: [index(few), ...few, item('memory-file', 'stray.md', { indexed: false })] }), [])
    const label = (map: ContextMap, id: string): string | undefined => blocksOf(map).find((b) => b.id === id)?.label
    expect(small.edges.map((e) => [label(small, e.from), label(small, e.to), e.kind])).toEqual([
      ['MEMORY.md', 'memory-file-1', 'index'],
      ['MEMORY.md', 'memory-file-2', 'index']
    ])

    const lots = files(9)
    const big = mapLayout(report({ account: [index(lots), ...lots] }), [])
    expect(big.edges.map((e) => [label(big, e.from), label(big, e.to), e.kind])).toEqual([['MEMORY.md', '9 memory files', 'index']])
  })

  it('draws memory files MEMORY.md never links apart from the linked ones, each set grouped on its own', () => {
    const linked = many('memory-file', 9).map((m) => ({ ...m, indexed: true }))
    const unlinked = ['x.md', 'y.md'].map((n) => item('memory-file', n, { indexed: false }))
    const map = mapLayout(report({ account: [unlinked[0], ...linked, unlinked[1]] }), [])
    const blocks = map.lanes[0].bands[1].blocks
    expect(blocks.map((b) => [b.label, b.unindexed])).toEqual([
      ['9 memory files', false],
      ['x.md', true],
      ['y.md', true]
    ])

    const lots = many('memory-file', 9).map((m) => ({ ...m, label: `u-${m.label}`, path: `/x/u-${m.label}`, indexed: false }))
    const grouped = mapLayout(report({ account: [...linked, ...lots] }), [])
    expect(band(grouped, 'account', 'on-demand')).toEqual(['9 memory files', '9 unlinked memory files'])
    expect(grouped.lanes[0].bands[1].blocks.map((b) => b.unindexed)).toEqual([false, true])
  })

  it('attaches each finding to the block of the file it concerns, a collapsed group taking its members findings', () => {
    const finding = (id: string, path: string): Finding => ({ id, path, verdict: 'structural', severity: 'problem', claim: id, evidence: '', fix: '', status: 'open' })
    const memory = many('memory-file', 9).map((m) => ({ ...m, indexed: true }))
    const map = mapLayout(
      report({ account: [item('claude-md', 'CLAUDE.md', { tokens: 9 }), item('memory-index', 'MEMORY.md', { tokens: 4 }), ...memory] }),
      [finding('H1', '/x/MEMORY.md'), finding('H2', '/x/memory-file-3'), finding('H3', '/x/memory-file-7'), finding('H4', '/elsewhere.md')]
    )
    expect(blocksOf(map).map((b) => [b.label, b.findings.map((f) => f.id)])).toEqual([
      ['CLAUDE.md', []],
      ['MEMORY.md', ['H1']],
      ['9 memory files', ['H2', 'H3']]
    ])
  })

  it('attaches a drift finding whose path differs from the file only in case and slashes, keeping its marks', () => {
    const claudeMd = item('claude-md', 'CLAUDE.md', { path: 'C:\\Users\\a\\.claude\\CLAUDE.md', tokens: 9 })
    const drift = { id: 'F1', path: 'c:/users/a/.claude/claude.md', verdict: 'stale', severity: 'problem', claim: '', evidence: '', fix: '', status: 'open', stale: true, accountWide: true } as const
    const [block] = blocksOf(mapLayout(report({ account: [claudeMd] }), [drift]))
    expect(block.findings).toEqual([drift])
  })
})
