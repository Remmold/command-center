import { describe, expect, it } from 'vitest'
import type { ContextItem, ContextItemKind, ContextLayerName, ContextReport } from '../../shared/context'
import { BLOCK_SIZE_FLOOR, mapLayout, type ContextMap, type MapBandName } from './mapLayout'

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
})
