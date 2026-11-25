import { describe, expect, it } from 'vitest'
import { estimateTokens, formatTokens, groupByKind, splitFrontmatter, type ContextItem, type ContextItemKind, type KindGroup } from './context'

describe('token estimate', () => {
  it('is characters divided by four, rounded', () => {
    expect(estimateTokens('')).toBe(0)
    expect(estimateTokens('abcdef')).toBe(2)
    expect(estimateTokens('abcde')).toBe(1)
  })

  it('reads as ~N below a thousand and ~N.Nk from there', () => {
    expect(formatTokens(0)).toBe('~0')
    expect(formatTokens(999)).toBe('~999')
    expect(formatTokens(1000)).toBe('~1.0k')
    expect(formatTokens(4200)).toBe('~4.2k')
    expect(formatTokens(12_345)).toBe('~12.3k')
  })
})

describe('frontmatter split', () => {
  it('takes a closed leading block apart from the body, CRLF included', () => {
    expect(splitFrontmatter('---\r\nname: flow\r\ndescription: "Runs it"\r\n---\r\n# Flow\r\nbody')).toEqual({
      meta: { name: 'flow', description: 'Runs it' },
      body: '# Flow\nbody'
    })
  })

  it('leaves the text whole when the block never closes or holds no key', () => {
    expect(splitFrontmatter('---\nname: flow\n# Flow')).toEqual({ meta: {}, body: '---\nname: flow\n# Flow' })
    expect(splitFrontmatter('---\n- a list\n---\nbody')).toEqual({ meta: {}, body: '---\n- a list\n---\nbody' })
    expect(splitFrontmatter('# Plain\n---\nname: x\n---')).toEqual({ meta: {}, body: '# Plain\n---\nname: x\n---' })
  })
})

function item(kind: ContextItemKind, label: string, tokens: number | null, children: ContextItem[] = []): ContextItem {
  return { kind, label, note: null, path: null, source: 'repo', tokens, missing: false, sharedWithDefault: false, readOnly: null, children }
}

const labels = (groups: KindGroup[]): [string, string[]][] => groups.map((g) => [g.group, g.items.map((i) => i.label)])

describe('kind groups', () => {
  it('orders a layer CLAUDE.md, Memory, Skills, Agents, Commands, MCP servers, Plugins, Settings & hooks and drops empty kinds', () => {
    const groups = groupByKind([
      item('hook', 'PreToolUse', null),
      item('skill', 'tdd', 40),
      item('settings', '.claude/settings.json', null),
      item('plugin', 'mattpocock', null),
      item('memory-file', 'user_role.md', null),
      item('claude-md', 'CLAUDE.md', 100),
      item('mcp-server', 'blender', null),
      item('memory-index', 'MEMORY.md', 30),
      item('subfolder-claude-md', 'src/CLAUDE.md', null),
      item('skill', 'flow', 10)
    ])
    expect(labels(groups)).toEqual([
      ['claude-md', ['CLAUDE.md', 'src/CLAUDE.md']],
      ['memory', ['user_role.md', 'MEMORY.md']],
      ['skills', ['tdd', 'flow']],
      ['mcp-servers', ['blender']],
      ['plugins', ['mattpocock']],
      ['settings', ['PreToolUse', '.claude/settings.json']]
    ])
    expect(groups.map((g) => g.count)).toEqual([2, 2, 2, 1, 1, 2])
  })

  it('sums each group’s counted tokens with nested imports, and gives null when nothing in it counts', () => {
    const missing = { ...item('import', 'gone.md', 0), missing: true }
    const groups = groupByKind([
      item('claude-md', 'CLAUDE.md', 100, [item('import', 'rules.md', 20, [item('import', 'deep.md', 5)]), missing]),
      item('subfolder-claude-md', 'src/CLAUDE.md', null),
      item('memory-index', 'MEMORY.md', 30),
      item('memory-file', 'user_role.md', null),
      item('mcp-server', 'blender', null),
      item('settings', '.claude/settings.json', null),
      item('hook', 'PreToolUse', null)
    ])
    expect(groups.map((g) => [g.group, g.tokens])).toEqual([
      ['claude-md', 125],
      ['memory', 30],
      ['mcp-servers', null],
      ['settings', null]
    ])
    expect(groups[0].items[0].children.map((i) => i.label)).toEqual(['rules.md', 'gone.md'])
  })
})
