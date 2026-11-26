/** The three permission lists of a settings file, each a list of rules such as `Bash(git status *)`. */
export type RuleList = 'allow' | 'ask' | 'deny'

export const RULE_LISTS: readonly RuleList[] = ['allow', 'ask', 'deny']

export const ruleListKey = (list: RuleList): string => `permissions.${list}`

export const ruleListOf = (key: string): RuleList | null => RULE_LISTS.find((list) => ruleListKey(list) === key) ?? null

/** The tools the rule builder offers; `other` is any tool by name. */
export type RuleTool = 'Bash' | 'PowerShell' | 'Read' | 'Edit' | 'Write' | 'WebFetch' | 'WebSearch' | 'mcp' | 'Agent' | 'Skill' | 'other'

/** A rule as the builder holds it: `name` is the tool's name for `other`, empty otherwise. */
export interface BuiltRule {
  tool: RuleTool
  name: string
  pattern: string
}

export interface RuleToolChoice {
  value: RuleTool
  label: string
  /** Hint text for the pattern box; null when the tool takes no pattern. */
  placeholder: string | null
}

export const RULE_TOOLS: readonly RuleToolChoice[] = [
  { value: 'Bash', label: 'Bash', placeholder: 'git status *  (empty: every command)' },
  { value: 'PowerShell', label: 'PowerShell', placeholder: 'Get-ChildItem *  (empty: every command)' },
  { value: 'Read', label: 'Read', placeholder: './src/**  (empty: any file)' },
  { value: 'Edit', label: 'Edit', placeholder: './src/**  (empty: any file)' },
  { value: 'Write', label: 'Write', placeholder: './src/**  (empty: any file)' },
  { value: 'WebFetch', label: 'WebFetch', placeholder: 'github.com, or * for any site' },
  { value: 'WebSearch', label: 'WebSearch', placeholder: null },
  { value: 'mcp', label: 'An MCP server', placeholder: 'server, or server__tool' },
  { value: 'Agent', label: 'Agent (subagent)', placeholder: 'Explore  (empty: every subagent)' },
  { value: 'Skill', label: 'Skill', placeholder: 'skill name  (empty: every skill)' },
  { value: 'other', label: 'Another tool', placeholder: 'pattern, if the tool takes one' }
]

const MCP_PREFIX = 'mcp__'
const WEB_DOMAIN = 'domain:'

const withPattern = (tool: string, pattern: string): string => (pattern ? `${tool}(${pattern})` : tool)

export function buildRule({ tool, name, pattern }: BuiltRule): string {
  const typed = pattern.trim()
  switch (tool) {
    case 'mcp':
      return `${MCP_PREFIX}${typed}`
    case 'WebFetch':
      return withPattern('WebFetch', typed && `${WEB_DOMAIN}${typed}`)
    case 'WebSearch':
      return 'WebSearch'
    case 'other':
      return withPattern(name.trim(), typed)
    default:
      return withPattern(tool, typed)
  }
}

/** The builder's pick for a rule's text; a rule the builder can't make the same way reads as `other`, so it builds back to its text. */
export function readRule(text: string): BuiltRule {
  if (text.startsWith(MCP_PREFIX)) return { tool: 'mcp', name: '', pattern: text.slice(MCP_PREFIX.length) }
  const match = /^([^()]+)\((.+)\)$/s.exec(text)
  const tool = match ? match[1] : text
  const pattern = match ? match[2] : ''
  const known = RULE_TOOLS.some((t) => t.value === tool && t.value !== 'other')
  const asOther: BuiltRule = { tool: 'other', name: match ? tool : text, pattern }
  if (!known) return asOther
  if (tool === 'WebSearch') return match ? asOther : { tool, name: '', pattern: '' }
  if (tool === 'WebFetch') {
    if (!match) return { tool, name: '', pattern: '' }
    return pattern.startsWith(WEB_DOMAIN) && pattern.length > WEB_DOMAIN.length ? { tool, name: '', pattern: pattern.slice(WEB_DOMAIN.length) } : asOther
  }
  const built: BuiltRule = { tool: tool as RuleTool, name: '', pattern }
  return buildRule(built) === text ? built : asOther
}

const VERBS: Record<RuleList, string> = { allow: 'Allow', ask: 'Ask before', deny: 'Never allow' }

function shellWords(shell: string, pattern: string): string {
  if (pattern === '' || pattern === '*') return `every ${shell} command`
  const legacyPrefix = /^(.*):\*$/s.exec(pattern)
  if (legacyPrefix) return `${shell} commands starting with ${legacyPrefix[1]}`
  const stars = pattern.split('*').length - 1
  if (stars === 1 && pattern.endsWith('*')) return `${shell} commands starting with ${pattern.slice(0, -1).trimEnd()}`
  return stars > 0 ? `${shell} commands matching ${pattern}` : `the ${shell} command ${pattern}`
}

const FILE_VERBS: Partial<Record<RuleTool, string>> = { Read: 'reading', Edit: 'editing', Write: 'writing' }

function mcpWords(rest: string): string {
  const [server, ...tool] = rest.split('__')
  const name = tool.join('__')
  return name === '' || name === '*' ? `every tool of the MCP server ${server}` : `the tool ${name} of the MCP server ${server}`
}

function ruleWords({ tool, name, pattern }: BuiltRule): string {
  const fileVerb = FILE_VERBS[tool]
  if (fileVerb) return pattern ? `${fileVerb} files matching ${pattern}` : `${fileVerb} any file`
  switch (tool) {
    case 'Bash':
    case 'PowerShell':
      return shellWords(tool, pattern)
    case 'WebFetch':
      if (!pattern) return 'fetching any web page'
      return pattern === '*' ? 'fetching pages from any website' : `fetching pages from ${pattern}`
    case 'WebSearch':
      return 'web searches'
    case 'mcp':
      return mcpWords(pattern)
    case 'Agent':
      return pattern ? `the ${pattern} subagent` : 'every subagent'
    case 'Skill':
      return pattern ? `the skill ${pattern}` : 'every skill'
    default:
      return pattern ? `the ${name} tool for ${pattern}` : `the ${name} tool`
  }
}

/** A plain sentence of what the rule does in its list, such as "Allow Bash commands starting with git status". */
export const describeRule = (list: RuleList, text: string): string => `${VERBS[list]} ${ruleWords(readRule(text))}`

const EVERY_SHELL_COMMAND = new Set(['Bash', 'Bash(*)', 'PowerShell', 'PowerShell(*)'])

/** The warning for an Allow rule that lets every shell command run, else null. */
export const ruleRisk = (text: string): string | null =>
  EVERY_SHELL_COMMAND.has(text) ? `${text} lets Claude run any ${text.startsWith('Bash') ? 'Bash' : 'PowerShell'} command without asking, including ones that delete files.` : null

/** Whether a list value is one the rules editor can show and edit: missing, or a list of text rules. */
export const isRuleList = (value: unknown): value is string[] | undefined => value === undefined || (Array.isArray(value) && value.every((rule) => typeof rule === 'string'))

export type RuleLists = Record<RuleList, readonly string[] | undefined>

/** The lists a move changes, by list: the rule out of `from`, onto the end of `to` unless `to` has it. */
export function moveRule(lists: RuleLists, rule: string, from: RuleList, to: RuleList): Partial<Record<RuleList, string[]>> {
  const target = lists[to] ?? []
  const changed: Partial<Record<RuleList, string[]>> = { [from]: (lists[from] ?? []).filter((r) => r !== rule) }
  if (!target.includes(rule)) changed[to] = [...target, rule]
  return changed
}
