import type { CliCommand } from '../../../shared/types'
import { fuzzySearch, wordStartMatch } from './fuzzySearch'

/** The extension's sections, in its order (`DSn`). */
export const SECTION_ORDER = ['Context', 'Model', 'Customize', 'Settings', 'Slash Commands', 'Support', 'MCP servers'] as const
export type SectionName = (typeof SECTION_ORDER)[number]

/** Where a command the app handles itself opens. */
export type OpenTarget = 'usage' | 'context' | 'model'

export interface LocalAction {
  id: string
  section: SectionName
  label: string
  description?: string
  /** Shown only once something is typed. */
  filterOnly?: boolean
  /** Runs without closing the menu or touching the input, like the extension's toggles. */
  keepOpen?: boolean
}

export interface MenuCommand {
  id: string
  label: string
  description?: string
  argumentHint?: string
  aliases?: readonly string[]
  filterOnly?: boolean
  keepOpen?: boolean
  /** Set for a CLI command the app opens its own UI for instead of sending it. */
  opens?: OpenTarget
  /** True for a CLI command (`/name`), false for one of the app's actions. */
  slash: boolean
}

export interface MenuSection {
  name: SectionName
  commands: MenuCommand[]
}

export interface Menu {
  sections: MenuSection[]
}

/** Commands the extension's webview owns (`$u`), kept out of the CLI's list there too. */
const EXTENSION_OWNED = new Set([
  'btw', 'chrome', 'bug', 'design-login', 'feedback', 'help', 'skills', 'tasks', 'workflows',
  'terminal', 'remote-control', 'copy', 'export', 'fork', 'status', 'plan'
])

/** Names the extension keeps for its own UI when the CLI reports no built-ins (`kLn`). */
const UI_NAMES = new Set(['mcp', 'config', 'settings', 'model', 'usage', 'context'])

/** The extension's `jW`: true when a custom command, not the CLI's own, answers to `name`. */
export function customOverrides(commands: readonly CliCommand[], name: string): boolean {
  const hit = commands.find((c) => c.name === name || c.aliases.includes(name))
  if (!hit) return false
  if (!commands.some((c) => c.builtin)) return !UI_NAMES.has(name)
  if (commands.some((c) => c.builtin && c.name === name)) return false
  return !hit.builtin
}

/** The extension's `bLe`: a name two commands share is invoked by its namespaced alias. */
function invocations(commands: readonly CliCommand[]): { cmd: CliCommand; invocation: string }[] {
  const counts = new Map<string, number>()
  for (const c of commands) counts.set(c.name, (counts.get(c.name) ?? 0) + 1)
  return commands.map((cmd) => {
    const namespaced = cmd.aliases.find((a) => a.endsWith(`:${cmd.name}`))
    return { cmd, invocation: (counts.get(cmd.name) ?? 0) > 1 && namespaced ? namespaced : cmd.name }
  })
}

function opensFor(commands: readonly CliCommand[], name: string): OpenTarget | undefined {
  if ((name === 'usage' || name === 'context' || name === 'model') && !customOverrides(commands, name)) return name
  return undefined
}

export function buildMenu(commands: readonly CliCommand[], local: readonly LocalAction[]): Menu {
  const slash: MenuCommand[] = invocations(commands)
    .filter(({ invocation }) => !EXTENSION_OWNED.has(invocation))
    .map(({ cmd, invocation }) => ({
      id: `slash-command-${invocation}`,
      label: `/${invocation}`,
      description: cmd.description || undefined,
      argumentHint: cmd.argumentHint || undefined,
      aliases: cmd.aliases,
      opens: opensFor(commands, invocation),
      slash: true
    }))
    .sort((a, b) => a.label.localeCompare(b.label))
  const actions = (name: SectionName): MenuCommand[] =>
    local
      .filter((a) => a.section === name)
      .map((a) => ({
        id: a.id,
        label: a.label,
        description: a.description,
        filterOnly: a.filterOnly,
        keepOpen: a.keepOpen,
        slash: false
      }))
  const sections = SECTION_ORDER.map((name): MenuSection => ({
    name,
    commands: name === 'Slash Commands' ? [...slash, ...actions(name)].sort((a, b) => a.label.localeCompare(b.label)) : actions(name)
  }))
  return { sections: sections.filter((s) => s.commands.length > 0) }
}

const bare = (label: string): string => (label.startsWith('/') ? label.slice(1) : label)

/** The extension's ranking (`GBn`): exact label or alias, then prefix, then other fuzzy hits. */
function rank(cmd: MenuCommand, query: string): number {
  const label = bare(cmd.label.toLowerCase())
  const aliases = (cmd.aliases ?? []).map((a) => a.toLowerCase())
  if (label === query || aliases.includes(query)) return 0
  if (label.startsWith(query) || aliases.some((a) => a.startsWith(query))) return 1
  return 2
}

/** The rows for a `/` query typed in the input; an empty query lists every section. */
export function menuSections(menu: Menu, rawQuery: string): MenuSection[] {
  const query = rawQuery.toLowerCase()
  if (query === '') {
    return menu.sections
      .map((s) => ({ name: s.name, commands: s.commands.filter((c) => !c.filterOnly) }))
      .filter((s) => s.commands.length > 0)
  }
  const flat = menu.sections.flatMap((s) => s.commands.map((cmd) => ({ cmd, section: s.name })))
  const hits = fuzzySearch(
    flat,
    [
      { get: (e) => e.cmd.label, weight: 3 },
      { get: (e) => e.cmd.aliases, weight: 2 },
      { get: (e) => e.cmd.id, weight: 2 },
      { get: (e) => e.cmd.description, weight: 0.5 }
    ],
    query,
    0.3
  )
  const ranks = new Map(hits.map(({ item }) => [item.cmd, rank(item.cmd, query)]))
  hits.sort((a, b) => ranks.get(a.item.cmd)! - ranks.get(b.item.cmd)! || a.score - b.score)
  const grouped = new Map<SectionName, MenuCommand[]>()
  for (const { item } of hits) {
    const list = grouped.get(item.section) ?? []
    list.push(item.cmd)
    grouped.set(item.section, list)
  }
  for (const list of grouped.values()) list.sort((a, b) => ranks.get(a)! - ranks.get(b)!)
  return [...grouped].map(([name, commands]) => ({ name, commands }))
}

/** The row Enter picks before any arrow key: the first one, if the query word-start matches it. */
export function initialActive(sections: readonly MenuSection[], query: string): string | null {
  const first = sections[0]?.commands[0]
  if (!first || query === '') return null
  return wordStartMatch(query, [bare(first.label), ...(first.aliases ?? [])], /[:_\s-]+/g) ? first.id : null
}

/** ↑/↓ with wrap-around; from no row, ↓ lands on the first and ↑ on the last. */
export function moveActive(flat: readonly MenuCommand[], active: string | null, direction: 'up' | 'down'): string | null {
  if (flat.length === 0) return null
  const at = flat.findIndex((c) => c.id === active)
  if (direction === 'down') return flat[at < flat.length - 1 ? at + 1 : 0].id
  return flat[at > 0 ? at - 1 : flat.length - 1].id
}

export interface SlashTrigger {
  start: number
  end: number
  query: string
}

/** The `/query` around the caret: a `/` at the start or after whitespace, up to the next space or `/`. */
export function slashTrigger(value: string, caret: number): SlashTrigger | null {
  for (const match of value.matchAll(/(?:^|\s)\/[^\s/]*/gm)) {
    const start = value.indexOf('/', match.index)
    const end = match.index + match[0].length
    if (caret >= start && caret <= end) return { start, end, query: value.slice(start + 1, end) }
  }
  return null
}

export type Selection =
  | { kind: 'insert'; value: string; caret: number }
  | { kind: 'send'; text: string; value: string; caret: number }
  | { kind: 'open'; target: OpenTarget; value: string; caret: number }
  | { kind: 'action'; id: string; value: string; caret: number }

/** What picking a row does to the input (the extension's `Hn`); `viaTab` is Tab rather than Enter or a click. */
export function selectCommand(cmd: MenuCommand, viaTab: boolean, value: string, trigger: SlashTrigger): Selection {
  const before = value.slice(0, trigger.start)
  const after = value.slice(trigger.end)
  if (cmd.slash && (viaTab || before.trim().length > 0)) {
    const inserted = before + cmd.label + (after.startsWith(' ') ? '' : ' ') + after
    return { kind: 'insert', value: inserted, caret: trigger.start + cmd.label.length + 1 }
  }
  const rest = { value: before + after, caret: trigger.start }
  if (!cmd.slash) return { kind: 'action', id: cmd.id, ...rest }
  if (cmd.opens) return { kind: 'open', target: cmd.opens, ...rest }
  return { kind: 'send', text: cmd.label, ...rest }
}

/** The ghost hint after `/name ` (the extension's `/^\/(\S+) $/`). */
export function argumentHint(menu: Menu, value: string): string | undefined {
  const match = /^\/(\S+) $/.exec(value)
  if (!match) return undefined
  const label = `/${match[1]}`
  return menu.sections.flatMap((s) => s.commands).find((c) => c.label === label)?.argumentHint
}
