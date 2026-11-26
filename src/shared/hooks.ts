import { SOURCE_ORDER, isSettingsObject, isStringList, keyPath, sameValue, type SettingsLayer, type SourceLayer } from './claudeSettings'

/** What a matcher filters on, for an event that takes one. */
interface MatcherSpec {
  /** "the tool", "how the chat started", … */
  subject: string
  examples: string
}

export interface HookEvent {
  name: string
  /** When it runs, in plain words: "Before a tool runs". */
  label: string
  description: string
  /** Null when the event ignores matchers. */
  matcher: MatcherSpec | null
  /** The hook types the event runs, when not all of them. */
  types?: readonly HookType[]
}

const TOOL: MatcherSpec = { subject: 'the tool', examples: 'Bash, Edit|Write or mcp__memory__.*' }
const AGENT_TYPE: MatcherSpec = { subject: 'the subagent', examples: 'Explore or Plan' }
const COMPACT_TRIGGER: MatcherSpec = { subject: 'how it started', examples: 'manual or auto' }
const MCP_SERVER: MatcherSpec = { subject: 'the MCP server', examples: 'the server’s name' }
const SKILL_SHELL: MatcherSpec = { subject: 'the tool', examples: 'Bash|PowerShell' }
const NEW_MODEL: MatcherSpec = { subject: 'the model it switches to', examples: 'claude-opus-5 or .*opus.*' }
const NO_PROMPT_OR_AGENT: readonly HookType[] = ['command', 'http', 'mcp_tool']

/** Every event the settings schema documents, in the order a chat meets them. */
export const HOOK_EVENTS: readonly HookEvent[] = [
  { name: 'SessionStart', label: 'When a chat starts or resumes', description: 'Runs as a chat starts, resumes, or starts over after a clear or a compaction. What it prints is added to the chat.', matcher: { subject: 'how the chat started', examples: 'startup, resume, clear or compact' }, types: ['command', 'mcp_tool'] },
  { name: 'Setup', label: 'When Claude sets up a repo', description: 'Runs when Claude starts with --init, --init-only or --maintenance.', matcher: { subject: 'the flag', examples: 'init or maintenance' }, types: ['command'] },
  { name: 'InstructionsLoaded', label: 'When a CLAUDE.md or rules file loads', description: 'Runs each time a CLAUDE.md or .claude/rules file is read into the chat. It can only watch, for logging.', matcher: { subject: 'why it loaded', examples: 'session_start, nested_traversal or path_glob_match' }, types: NO_PROMPT_OR_AGENT },
  { name: 'UserPromptSubmit', label: 'When you send a prompt', description: 'Runs before Claude reads your prompt. It can add context to it or block it.', matcher: null },
  { name: 'UserPromptExpansion', label: 'When a command expands into a prompt', description: 'Runs when a slash command or skill you typed becomes a prompt, before Claude reads it. It can block it.', matcher: { subject: 'the command', examples: 'a command or skill name' } },
  { name: 'PreSkillShellCommand', label: 'Before a skill runs a shell command', description: 'Runs before a shell command written into a skill or custom command runs as it loads. It can block the command; Before a tool runs doesn’t see these.', matcher: SKILL_SHELL, types: NO_PROMPT_OR_AGENT },
  { name: 'PreToolUse', label: 'Before a tool runs', description: 'Runs before Claude uses a tool. It can allow, block or change the call.', matcher: TOOL },
  { name: 'PermissionRequest', label: 'When Claude asks permission', description: 'Runs when a tool call would ask for your approval. It can answer for you.', matcher: TOOL, types: ['command', 'http', 'mcp_tool', 'prompt'] },
  { name: 'PermissionDenied', label: 'When auto mode refuses a tool', description: 'Runs when the auto mode safety check denies a tool call.', matcher: TOOL },
  { name: 'PostToolUse', label: 'After a tool succeeds', description: 'Runs after a tool call worked. It can tell Claude about a problem with the result.', matcher: TOOL },
  { name: 'PostToolUseFailure', label: 'After a tool fails', description: 'Runs after a tool call failed.', matcher: TOOL },
  { name: 'PostToolBatch', label: 'After a batch of tool calls', description: 'Runs once every tool call Claude made at the same time has finished, before Claude goes on. It can stop the turn.', matcher: null },
  { name: 'Notification', label: 'When Claude sends a notification', description: 'Runs when Claude would notify you, such as when it waits for your approval or for a prompt.', matcher: { subject: 'the kind of notification', examples: 'permission_prompt or idle_prompt' }, types: NO_PROMPT_OR_AGENT },
  { name: 'MessageDisplay', label: 'While Claude’s reply shows', description: 'Runs while the text of Claude’s reply is shown.', matcher: null, types: NO_PROMPT_OR_AGENT },
  { name: 'SubagentStart', label: 'When a subagent starts', description: 'Runs when Claude starts a subagent.', matcher: AGENT_TYPE, types: NO_PROMPT_OR_AGENT },
  { name: 'SubagentStop', label: 'When a subagent finishes', description: 'Runs when a subagent finishes. It can send the subagent back to work.', matcher: AGENT_TYPE },
  { name: 'TaskCreated', label: 'When a task is created', description: 'Runs when Claude adds a task to its list. Exit code 2 takes the task back out.', matcher: null },
  { name: 'TaskCompleted', label: 'When a task is marked done', description: 'Runs when a task is about to be marked done. Exit code 2 keeps it open and tells Claude why.', matcher: null },
  { name: 'Stop', label: 'When Claude finishes answering', description: 'Runs when Claude ends its turn, not when you interrupt it. It can make Claude carry on.', matcher: null },
  { name: 'StopFailure', label: 'When a turn ends on an error', description: 'Runs when a turn stops because of an API error, such as a rate limit. What it prints is ignored.', matcher: { subject: 'the error', examples: 'rate_limit, authentication_failed or server_error' }, types: NO_PROMPT_OR_AGENT },
  { name: 'TeammateIdle', label: 'When a teammate is about to go idle', description: 'Runs when a teammate in an agent team is about to stop. Exit code 2 keeps it working.', matcher: null },
  { name: 'PreCompact', label: 'Before the chat is compacted', description: 'Runs before Claude summarises the chat to free up context.', matcher: COMPACT_TRIGGER, types: NO_PROMPT_OR_AGENT },
  { name: 'PostCompact', label: 'After the chat is compacted', description: 'Runs after Claude summarised the chat.', matcher: COMPACT_TRIGGER, types: NO_PROMPT_OR_AGENT },
  { name: 'PreModelSwitch', label: 'Before you switch models', description: 'Runs before a model switch you or a client asked for, such as /model. It can block the switch; switches Claude makes itself skip it.', matcher: NEW_MODEL, types: NO_PROMPT_OR_AGENT },
  { name: 'PostModelSwitch', label: 'After the model changes', description: 'Runs after the chat’s model changed, also when Claude changed it itself, such as on resume. What it prints is added to the chat.', matcher: NEW_MODEL, types: NO_PROMPT_OR_AGENT },
  { name: 'Elicitation', label: 'When an MCP server asks you something', description: 'Runs when an MCP server asks for your input during a tool call. It can answer for you.', matcher: MCP_SERVER, types: NO_PROMPT_OR_AGENT },
  { name: 'ElicitationResult', label: 'After you answer an MCP server', description: 'Runs after you answered an MCP server, before the answer goes back to it.', matcher: MCP_SERVER, types: NO_PROMPT_OR_AGENT },
  { name: 'ConfigChange', label: 'When a settings or skill file changes', description: 'Runs when a settings file or skill changes during a chat. Exit code 2 refuses the change, except for organisation settings.', matcher: { subject: 'the file', examples: 'user_settings, project_settings, local_settings or skills' }, types: NO_PROMPT_OR_AGENT },
  { name: 'CwdChanged', label: 'When the working folder changes', description: 'Runs each time the chat’s working folder changes, such as after a cd.', matcher: null, types: NO_PROMPT_OR_AGENT },
  { name: 'DirectoryAdded', label: 'When a folder is added to the chat', description: 'Runs after a folder is added mid-chat, such as with /add-dir.', matcher: { subject: 'how it was added', examples: 'slash_command or register_repo_root' }, types: NO_PROMPT_OR_AGENT },
  { name: 'FileChanged', label: 'When a watched file changes', description: 'Runs when a file it watches is created, changed or deleted.', matcher: { subject: 'the file names to watch', examples: '.envrc|.env' }, types: NO_PROMPT_OR_AGENT },
  { name: 'WorktreeCreate', label: 'When a worktree is made', description: 'Makes the worktree instead of git: it must print the new folder’s full path, and a failure stops the worktree.', matcher: null, types: NO_PROMPT_OR_AGENT },
  { name: 'WorktreeRemove', label: 'When a worktree is removed', description: 'Runs when a worktree is removed as a chat or subagent ends, to clean up. It can’t stop the removal.', matcher: null, types: NO_PROMPT_OR_AGENT },
  { name: 'SessionEnd', label: 'When a chat ends', description: 'Runs as a chat ends, to clean up or log. It can’t stop the chat ending.', matcher: { subject: 'why it ended', examples: 'clear, logout, prompt_input_exit or other' }, types: NO_PROMPT_OR_AGENT }
]

export const hookEvent = (name: string): HookEvent | undefined => HOOK_EVENTS.find((e) => e.name === name)

export const runsType = (event: HookEvent | undefined, type: string): boolean => !event?.types || event.types.some((t) => t === type)

/** Whether the event is a tool call's or a skill's shell command, the only kinds a hook's `if` filter counts on. */
export const takesIf = (event: HookEvent | undefined): boolean => event?.matcher === TOOL || event?.matcher === SKILL_SHELL

export type HookType = 'command' | 'prompt' | 'agent' | 'http' | 'mcp_tool'

export type Hook = { type: string } & Record<string, unknown>

export interface HookGroup {
  matcher?: string
  hooks: Hook[]
}

export const HOOK_TYPES: readonly { value: HookType; label: string; description: string }[] = [
  { value: 'command', label: 'Command', description: 'Runs a shell command, which gets the event as JSON on its input.' },
  { value: 'prompt', label: 'Prompt', description: 'Asks a fast model a yes-or-no question about the event.' },
  { value: 'agent', label: 'Agent', description: 'Starts a subagent with tools that checks the event.' },
  { value: 'http', label: 'Web request', description: 'Sends the event as JSON to a web address.' },
  { value: 'mcp_tool', label: 'MCP tool', description: 'Calls a tool of an MCP server that is already connected.' }
]

export type HookFieldKind = 'text' | 'number' | 'toggle' | 'choice' | 'list' | 'object'

export interface HookField {
  key: string
  label: string
  kind: HookFieldKind
  description: string
  /** A hook of its type needs it. */
  required?: boolean
  options?: readonly { value: string; label: string }[]
  placeholder?: string
}

const TIMEOUT: HookField = { key: 'timeout', label: 'Time limit', kind: 'number', description: 'Seconds before Claude stops waiting for it.' }
const IF: HookField = {
  key: 'if',
  label: 'Only for calls matching',
  kind: 'text',
  description: 'A permission rule, such as Bash(git *). Counts only on tool events; on any other event the hook never runs.',
  placeholder: 'Bash(git *)'
}
const STATUS: HookField = { key: 'statusMessage', label: 'Message while it runs', kind: 'text', description: 'Shown beside the spinner while the hook runs.' }
const MODEL: HookField = { key: 'model', label: 'Model', kind: 'text', description: 'The model that answers. Empty uses a fast model.', placeholder: 'a fast model' }
const PROMPT: HookField = { key: 'prompt', label: 'Prompt', kind: 'text', required: true, description: '$ARGUMENTS stands for the event as JSON.', placeholder: 'Is this command safe? $ARGUMENTS' }

export const HOOK_FIELDS: Record<HookType, readonly HookField[]> = {
  command: [
    { key: 'command', label: 'Command', kind: 'text', required: true, description: 'The shell command to run.', placeholder: 'node ~/.claude/hooks/check.js' },
    { key: 'args', label: 'Arguments', kind: 'list', description: 'Set to run the command directly with these arguments, without a shell. Separate them with commas.' },
    {
      key: 'shell',
      label: 'Shell',
      kind: 'choice',
      description: 'The shell the command runs in.',
      options: [
        { value: 'bash', label: 'Bash' },
        { value: 'powershell', label: 'PowerShell' }
      ]
    },
    TIMEOUT,
    { key: 'async', label: 'Run in the background', kind: 'toggle', description: 'Claude goes on without waiting for it.' },
    { key: 'asyncRewake', label: 'Wake Claude on exit code 2', kind: 'toggle', description: 'Runs in the background and wakes Claude when it exits with code 2.' },
    IF,
    STATUS
  ],
  prompt: [PROMPT, MODEL, TIMEOUT, IF, STATUS, { key: 'continueOnBlock', label: 'Carry on when it says no', kind: 'toggle', description: 'Claude gets the reason and carries on instead of stopping.' }],
  agent: [{ ...PROMPT, description: 'What the subagent checks. $ARGUMENTS stands for the event as JSON.' }, MODEL, TIMEOUT, IF, STATUS],
  http: [
    { key: 'url', label: 'Address', kind: 'text', required: true, description: 'The web address the event is sent to.', placeholder: 'http://localhost:8080/hook' },
    { key: 'headers', label: 'Headers', kind: 'object', description: 'Extra headers as JSON, such as {"Authorization": "Bearer $TOKEN"}.' },
    { key: 'allowedEnvVars', label: 'Variables it may send', kind: 'list', description: 'The environment variables the headers may use. Separate them with commas.' },
    TIMEOUT,
    IF,
    STATUS
  ],
  mcp_tool: [
    { key: 'server', label: 'MCP server', kind: 'text', required: true, description: 'The connected MCP server’s name.', placeholder: 'memory' },
    { key: 'tool', label: 'Tool', kind: 'text', required: true, description: 'The tool of that server to call.', placeholder: 'save' },
    { key: 'input', label: 'Tool input', kind: 'object', description: 'The tool’s arguments as JSON. ${tool_input.file_path} and the like take values from the event.' },
    TIMEOUT,
    IF,
    STATUS
  ]
}

const isHookType = (type: unknown): type is HookType => HOOK_TYPES.some((t) => t.value === type)

export const typeLabel = (type: string): string => HOOK_TYPES.find((t) => t.value === type)?.label ?? type

export const requiredFields = (type: HookType): HookField[] => HOOK_FIELDS[type].filter((f) => f.required)

function fieldFits(field: HookField, value: unknown): boolean {
  switch (field.kind) {
    case 'text':
      return typeof value === 'string'
    case 'number':
      return typeof value === 'number' && Number.isFinite(value) && value > 0
    case 'toggle':
      return typeof value === 'boolean'
    case 'choice':
      return field.options?.some((o) => o.value === value) ?? false
    case 'list':
      return isStringList(value)
    case 'object':
      return isSettingsObject(value) && (field.key !== 'headers' || Object.values(value).every((v) => typeof v === 'string'))
  }
}

function isEditableHook(value: unknown): value is Hook {
  if (!isSettingsObject(value) || !isHookType(value.type)) return false
  const fields = HOOK_FIELDS[value.type]
  return Object.entries(value).every(([key, inner]) => {
    if (key === 'type') return true
    const field = fields.find((f) => f.key === key)
    return field !== undefined && fieldFits(field, inner)
  })
}

const isEditableGroup = (value: unknown): value is HookGroup =>
  isSettingsObject(value) &&
  Object.keys(value).every((key) => key === 'matcher' || key === 'hooks') &&
  (value.matcher === undefined || typeof value.matcher === 'string') &&
  Array.isArray(value.hooks) &&
  value.hooks.every(isEditableHook)

const isEditableEvent = (name: string, value: unknown): value is HookGroup[] => hookEvent(name) !== undefined && Array.isArray(value) && value.every(isEditableGroup)

/** The parts of a `hooks` value the editor can't show, whole events at a time; `[]` is the whole value. */
export function hooksLeftOut(value: unknown): string[][] {
  if (!isSettingsObject(value)) return [[]]
  return Object.entries(value).flatMap(([name, groups]) => (isEditableEvent(name, groups) ? [] : [[name]]))
}

export interface EventHooks {
  event: string
  groups: HookGroup[]
}

const eventOrder = (name: string): number => HOOK_EVENTS.findIndex((e) => e.name === name)

/** The events the editor shows, in the order a chat meets them. */
export function readHookEvents(value: unknown): EventHooks[] {
  if (!isSettingsObject(value)) return []
  return Object.entries(value)
    .flatMap(([event, groups]) => (isEditableEvent(event, groups) ? [{ event, groups }] : []))
    .sort((a, b) => eventOrder(a.event) - eventOrder(b.event))
}

export const hookEventPath = (event: string): string => keyPath('hooks', event)

const nonEmpty = (groups: HookGroup[]): HookGroup[] | undefined => (groups.length > 0 ? groups : undefined)

/** The event's groups with one hook replaced, or removed when `hook` is undefined; undefined once the event has none left. */
export function changeHook(groups: readonly HookGroup[], groupIndex: number, hookIndex: number, hook: Hook | undefined): HookGroup[] | undefined {
  return nonEmpty(
    groups.flatMap((group, g) => {
      if (g !== groupIndex) return [group]
      const hooks = hook ? group.hooks.map((h, i) => (i === hookIndex ? hook : h)) : group.hooks.filter((_, i) => i !== hookIndex)
      return hooks.length > 0 ? [{ ...group, hooks }] : []
    })
  )
}

/** An empty matcher matches everything, so it is left out of the file. */
const withMatcher = (group: HookGroup, matcher: string): HookGroup => {
  const { matcher: _old, ...rest } = group
  return matcher.trim() === '' ? rest : { matcher: matcher.trim(), ...rest }
}

export function setMatcher(groups: readonly HookGroup[], groupIndex: number, matcher: string): HookGroup[] {
  return groups.map((group, g) => (g === groupIndex ? withMatcher(group, matcher) : group))
}

/** The event's groups with the hook added to the group with that matcher, else to a new group at the end. */
export function addHook(groups: readonly HookGroup[] | undefined, matcher: string, hook: Hook): HookGroup[] {
  const list = groups ?? []
  const wanted = matcher.trim()
  const at = list.findIndex((g) => (g.matcher ?? '') === wanted)
  if (at >= 0) return list.map((group, g) => (g === at ? { ...group, hooks: [...group.hooks, hook] } : group))
  return [...list, withMatcher({ hooks: [hook] }, wanted)]
}

/** The hook as another type: the fields both types have stay, `fields` gives the new type's own. */
export function retype(hook: Hook, type: HookType, fields: Record<string, unknown>): Hook {
  const keeps = HOOK_FIELDS[type].map((f) => f.key)
  const kept = Object.fromEntries(Object.entries(hook).filter(([key]) => keeps.includes(key)))
  return { type, ...kept, ...fields }
}

/** The one line a hook is known by: its command, prompt, address or tool. */
export function hookSummary(hook: Hook): string {
  switch (hook.type) {
    case 'command':
      return isStringList(hook.args) && hook.args.length > 0 ? `${String(hook.command)} ${hook.args.join(' ')}` : String(hook.command ?? '')
    case 'prompt':
    case 'agent':
      return String(hook.prompt ?? '')
    case 'http':
      return String(hook.url ?? '')
    case 'mcp_tool':
      return `${String(hook.server ?? '')} · ${String(hook.tool ?? '')}`
    default:
      return JSON.stringify(hook)
  }
}

const QUICK_EVENTS: Record<string, number> = { UserPromptSubmit: 30, PreModelSwitch: 30, PostModelSwitch: 30, MessageDisplay: 10 }

/** The seconds Claude waits for a hook of the type on the event when it sets no time limit. */
export function defaultTimeout(type: HookType, event: string): number {
  if (type === 'prompt') return 30
  if (type === 'agent') return 60
  return QUICK_EVENTS[event] ?? 600
}

const MATCH_ALL = new Set(['', '*'])

/** What a group's matcher means on its event, in plain words. */
export function matcherWords(event: HookEvent | undefined, matcher: string | undefined): string {
  const spec = event?.matcher
  if (!spec) return matcher && !MATCH_ALL.has(matcher) ? `Claude ignores the matcher ${matcher} on this event` : 'Every time'
  if (matcher === undefined || MATCH_ALL.has(matcher)) return 'Every time'
  return `Only when ${spec.subject} matches ${matcher}`
}

export const isCommandCenterPermissionHook = (hook: Hook): boolean => hook.type === 'command' && typeof hook.command === 'string' && hook.command.includes('permission-hook')

const groupHooks = (groups: unknown): { matcher?: string; hook: Hook }[] =>
  Array.isArray(groups) ? groups.flatMap((g) => (isEditableGroup(g) ? g.hooks.map((hook) => ({ matcher: g.matcher, hook })) : [])) : []

const hookLine = ({ matcher, hook }: { matcher?: string; hook: Hook }): string => (matcher && !MATCH_ALL.has(matcher) ? `${matcher}: ${hookSummary(hook)}` : hookSummary(hook))

/** A change of one event's hooks as Review shows it: the hooks added and removed, a changed hook as both. */
export function hookChangeText(before: unknown, after: unknown): string {
  const was = groupHooks(before)
  const now = groupHooks(after)
  const missing = (from: typeof was, other: typeof was) => from.filter((item) => !other.some((o) => sameValue(o, item)))
  const added = missing(now, was).map(hookLine)
  const removed = missing(was, now).map(hookLine)
  const parts = [added.length > 0 && `Added ${added.join(', ')}`, removed.length > 0 && `Removed ${removed.join(', ')}`].filter(Boolean)
  return parts.length > 0 ? parts.join(' · ') : 'Same hooks, new order'
}

export interface OtherLayerGroup {
  event: string
  group: HookGroup
  /** Every other layer with the group, highest first. */
  layers: SourceLayer[]
}

/** The groups other layers add to the workspace, per event in event order, without the groups the edited layer has too. */
export function otherLayerGroups(edited: SettingsLayer, layers: Record<SourceLayer, { hooks?: unknown } | null>): OtherLayerGroup[] {
  const own = readHookEvents(layers[edited]?.hooks)
  const found: OtherLayerGroup[] = []
  for (const layer of SOURCE_ORDER) {
    if (layer === edited) continue
    for (const { event, groups } of readHookEvents(layers[layer]?.hooks)) {
      for (const group of groups) {
        if (own.some((e) => e.event === event && e.groups.some((g) => sameValue(g, group)))) continue
        const known = found.find((f) => f.event === event && sameValue(f.group, group))
        if (known) known.layers.push(layer)
        else found.push({ event, group, layers: [layer] })
      }
    }
  }
  return found.sort((a, b) => eventOrder(a.event) - eventOrder(b.event))
}
