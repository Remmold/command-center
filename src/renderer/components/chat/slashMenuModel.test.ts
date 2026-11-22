import { describe, expect, it } from 'vitest'
import type { CliCommand } from '../../../shared/types'
import {
  argumentHint,
  buildMenu,
  initialActive,
  menuSections,
  moveActive,
  selectCommand,
  slashTrigger,
  type LocalAction,
  type MenuCommand
} from './slashMenuModel'

const cli = (name: string, extra: Partial<CliCommand> = {}): CliCommand => ({
  name,
  description: `${name} description`,
  argumentHint: '',
  aliases: [],
  builtin: true,
  ...extra
})

const COMMANDS: CliCommand[] = [
  cli('usage', { aliases: ['cost', 'stats'] }),
  cli('compact', { argumentHint: '<optional custom summarization instructions>' }),
  cli('clear', { aliases: ['reset', 'new'] }),
  cli('context'),
  cli('model', { argumentHint: '<model>' }),
  cli('review', { builtin: false }),
  cli('plan'),
  cli('tdd', { builtin: false, aliases: ['mattpocock-skills:tdd'] })
]

const LOCAL: LocalAction[] = [
  { id: 'switch-model', section: 'Model', label: 'Switch model…', description: 'Change the AI model' },
  { id: 'attach-file', section: 'Context', label: 'Attach file…', description: 'Upload a file to include in conversation' }
]

const labels = (sections: ReturnType<typeof menuSections>) => sections.map((s) => [s.name, s.commands.map((c) => c.label)])

describe('slashTrigger', () => {
  it('finds a / at the start or after whitespace, with the query up to the caret', () => {
    expect(slashTrigger('/comp', 5)).toEqual({ start: 0, end: 5, query: 'comp' })
    expect(slashTrigger('fix this /rev', 13)).toEqual({ start: 9, end: 13, query: 'rev' })
  })

  it('ignores a / inside a word, after a space in the query, or away from the caret', () => {
    expect(slashTrigger('a/b', 3)).toBeNull()
    expect(slashTrigger('/compact now', 12)).toBeNull()
    expect(slashTrigger('/model and more', 15)).toBeNull()
  })
})

describe('buildMenu and menuSections', () => {
  const menu = buildMenu(COMMANDS, LOCAL)

  it('lists every section in the extension order, the CLI commands sorted by label, without the commands the extension owns', () => {
    expect(labels(menuSections(menu, ''))).toEqual([
      ['Context', ['Attach file…']],
      ['Model', ['Switch model…']],
      ['Slash Commands', ['/clear', '/compact', '/context', '/model', '/review', '/tdd', '/usage']]
    ])
  })

  it("sorts the app's own slash rows in among the CLI's and runs them locally", () => {
    const withRc = buildMenu(COMMANDS, [...LOCAL, { id: 'remote-control', section: 'Slash Commands', label: '/remote-control', description: 'View and control this session from claude.ai/code' }])
    const slash = withRc.sections.find((s) => s.name === 'Slash Commands')!.commands
    expect(slash.map((c) => c.label)).toEqual(['/clear', '/compact', '/context', '/model', '/remote-control', '/review', '/tdd', '/usage'])
    const rc = slash.find((c) => c.id === 'remote-control')!
    expect(selectCommand(rc, false, '/remote', { start: 0, end: 7, query: 'remote' })).toEqual({ kind: 'action', id: 'remote-control', value: '', caret: 0 })
  })

  it('ranks an exact label first, then prefixes, then other fuzzy hits', () => {
    const flat = menuSections(menu, 'co').flatMap((s) => s.commands.map((c) => c.label))
    expect(flat.slice(0, 3).sort()).toEqual(['/compact', '/context', '/usage'])
    expect(menuSections(menu, 'model')[0].commands[0].label).toBe('/model')
  })

  it('matches aliases', () => {
    const flat = menuSections(menu, 'cost').flatMap((s) => s.commands.map((c) => c.label))
    expect(flat[0]).toBe('/usage')
  })

  it('returns nothing for a query that matches nothing', () => {
    expect(menuSections(menu, 'zzzzqqq')).toEqual([])
  })

  it('uses the namespaced alias when two commands share a name', () => {
    const twice = buildMenu([cli('tdd', { builtin: false, aliases: ['a:tdd'] }), cli('tdd', { builtin: false, aliases: ['b:tdd'] })], [])
    expect(menuSections(twice, '')[0].commands.map((c) => c.label)).toEqual(['/a:tdd', '/b:tdd'])
  })

  it('marks /usage, /context and /model as opening the app’s own UI unless a custom command takes the name', () => {
    const byLabel = (m: ReturnType<typeof buildMenu>, label: string) =>
      menuSections(m, '').flatMap((s) => s.commands).find((c) => c.label === label)
    expect(byLabel(menu, '/usage')?.opens).toBe('usage')
    expect(byLabel(menu, '/context')?.opens).toBe('context')
    expect(byLabel(menu, '/model')?.opens).toBe('model')
    expect(byLabel(menu, '/compact')?.opens).toBeUndefined()
    const custom = buildMenu([cli('compact'), cli('context', { builtin: false })], [])
    expect(byLabel(custom, '/context')?.opens).toBeUndefined()
  })
})

describe('active row', () => {
  const menu = buildMenu(COMMANDS, LOCAL)

  it('starts on the first row only when the query word-start matches it', () => {
    expect(initialActive(menuSections(menu, ''), '')).toBeNull()
    expect(initialActive(menuSections(menu, 'comp'), 'comp')).toBe('slash-command-compact')
    expect(initialActive(menuSections(menu, 'tdd'), 'tdd')).toBe('slash-command-tdd')
  })

  it('wraps round with the arrows', () => {
    const flat: MenuCommand[] = menuSections(menu, '').flatMap((s) => s.commands)
    expect(moveActive(flat, null, 'down')).toBe(flat[0].id)
    expect(moveActive(flat, flat.at(-1)!.id, 'down')).toBe(flat[0].id)
    expect(moveActive(flat, flat[0].id, 'up')).toBe(flat.at(-1)!.id)
  })
})

describe('selectCommand', () => {
  const menu = buildMenu(COMMANDS, LOCAL)
  const find = (label: string) => menuSections(menu, '').flatMap((s) => s.commands).find((c) => c.label === label)!

  it('Enter at the start sends /name and clears the query from the input', () => {
    const value = '/comp'
    expect(selectCommand(find('/compact'), false, value, slashTrigger(value, 5)!)).toEqual({ kind: 'send', text: '/compact', value: '', caret: 0 })
  })

  it('Tab inserts /name and a space, with the caret after it', () => {
    const value = '/comp'
    expect(selectCommand(find('/compact'), true, value, slashTrigger(value, 5)!)).toEqual({ kind: 'insert', value: '/compact ', caret: 9 })
  })

  it('Enter on a command typed mid-sentence inserts it in place', () => {
    const value = 'please /rev it'
    expect(selectCommand(find('/review'), false, value, slashTrigger(value, 11)!)).toEqual({ kind: 'insert', value: 'please /review it', caret: 15 })
  })

  it('Enter on a command the app opens itself runs it and clears the query', () => {
    const value = '/usa'
    expect(selectCommand(find('/usage'), false, value, slashTrigger(value, 4)!)).toEqual({ kind: 'open', target: 'usage', value: '', caret: 0 })
  })

  it('a local action runs and clears the query', () => {
    const value = '/attach'
    expect(selectCommand(find('Attach file…'), false, value, slashTrigger(value, 7)!)).toEqual({ kind: 'action', id: 'attach-file', value: '', caret: 0 })
  })
})

describe('argumentHint', () => {
  const menu = buildMenu(COMMANDS, LOCAL)

  it('shows the hint once the input is exactly "/name "', () => {
    expect(argumentHint(menu, '/compact ')).toBe('<optional custom summarization instructions>')
    expect(argumentHint(menu, '/compact')).toBeUndefined()
    expect(argumentHint(menu, '/compact x')).toBeUndefined()
    expect(argumentHint(menu, '/clear ')).toBeUndefined()
  })
})
