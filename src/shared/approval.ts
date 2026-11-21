export type ToolInput = Record<string, unknown>

export interface AllowReply {
  behavior: 'allow'
  updatedInput: ToolInput
  updatedPermissions: unknown[]
}

export function allowReply(input: ToolInput): AllowReply {
  return { behavior: 'allow', updatedInput: input, updatedPermissions: [] }
}

export interface DenyReply {
  behavior: 'deny'
  message: string
  interrupt: boolean
}

// Verbatim from the VS Code extension; the double space after the colon is theirs too.
const REJECTED_WITH_REASON =
  "The user doesn't want to proceed with this tool use. The tool use was rejected (eg. if it was a file edit, the new_string was NOT written to the file). The user provided the following reason for the rejection: "
const REJECTED_STOP =
  "The user doesn't want to proceed with this tool use. The tool use was rejected (eg. if it was a file edit, the new_string was NOT written to the file). STOP what you are doing and wait for the user to tell you how to proceed."

export function denyReply(feedback: string): DenyReply {
  const text = feedback.trim()
  if (!text) return { behavior: 'deny', message: REJECTED_STOP, interrupt: true }
  return { behavior: 'deny', message: `${REJECTED_WITH_REASON} ${text}`, interrupt: false }
}

export type PermissionDestination = 'localSettings' | 'userSettings' | 'projectSettings' | 'session' | 'cliArg'

/** One of the CLI's `permission_suggestions`, kept as sent so it can go back in `updatedPermissions`. */
export interface PermissionSuggestion {
  type: string
  destination?: string
  rules?: Array<{ toolName: string; ruleContent?: string }>
  directories?: string[]
  mode?: string
  [field: string]: unknown
}

export interface Grant {
  label: string
  full: string
}

/** A piece of the "Yes, allow …" label; `destination` marks the clickable "for <where>" word. */
export type LabelPart =
  | { text: string }
  | { grant: Grant }
  | { more: number; title: string }
  | { directories: number; title: string }
  | { destination: true }

const LINE_BREAKS = new RegExp(`\r\n|[\r\n\v\f${String.fromCharCode(0x85, 0x2028, 0x2029)}]`, 'g')
const oneLine = (text: string): string => text.replace(LINE_BREAKS, '⏎')
const bullets = (grants: Grant[]): string => grants.map((g) => `• ${oneLine(g.full)}`).join('\n')

function ruleGrant(rule: { toolName: string; ruleContent?: string }): Grant {
  const content = rule.ruleContent
  if (!content) return { label: rule.toolName, full: rule.toolName }
  const prefix = /^(.+):\*$/.exec(content)?.[1]
  if (prefix) return { label: prefix, full: content }
  const chars = [...content]
  return { label: chars.length > 20 ? chars.slice(0, 17).join('') + '…' : content, full: content }
}

function grantOf(grant: Grant): LabelPart {
  return { grant: { label: oneLine(grant.label), full: oneLine(grant.full) } }
}

const DONT_ASK_AGAIN = "Yes, and don't ask again"

/** The label of choice 2, or null when the CLI offered nothing to save. */
export function alwaysAllowLabel(suggestions: PermissionSuggestion[]): LabelPart[] | null {
  if (suggestions.length === 0) return null
  const rules: Grant[] = []
  const directories: Grant[] = []
  let modeChange: string | null = null
  for (const s of suggestions) {
    if (s.type === 'addRules') for (const rule of s.rules ?? []) rules.push(ruleGrant(rule))
    else if (s.type === 'addDirectories')
      for (const dir of s.directories ?? []) directories.push({ label: `${dir.split(/[/\\]/).pop() || dir}/`, full: dir })
    else if (s.type === 'setMode' && typeof s.mode === 'string') modeChange = s.mode
  }
  const forDestination: LabelPart[] = [{ text: ' for ' }, { destination: true }]
  const [first, second] = rules
  if (first) {
    if (rules.length === 1) return [{ text: 'Yes, allow ' }, grantOf(first), ...forDestination]
    if (rules.length === 2) return [{ text: 'Yes, allow ' }, grantOf(first), { text: ' and ' }, grantOf(second), ...forDestination]
    return [{ text: 'Yes, allow ' }, grantOf(first), { text: ' and ' }, { more: rules.length - 1, title: bullets(rules.slice(1)) }, ...forDestination]
  }
  const [dir] = directories
  if (dir) {
    if (directories.length === 1) return [{ text: 'Yes, allow access to ' }, grantOf(dir), ...forDestination]
    return [{ text: 'Yes, allow access to ' }, { directories: directories.length, title: bullets(directories) }, ...forDestination]
  }
  if (modeChange === 'acceptEdits') return [{ text: 'Yes, allow all edits this session' }]
  if (modeChange === 'default') return [{ text: 'Yes, return to normal mode' }]
  return [{ text: DONT_ASK_AGAIN }]
}

/** The places choice 2 cycles through, in the extension's order. */
export const DESTINATIONS: PermissionDestination[] = ['localSettings', 'userSettings', 'projectSettings', 'session']

export const DESTINATION_LABEL: Record<PermissionDestination, string> = {
  localSettings: 'this project (just you)',
  userSettings: 'all projects',
  projectSettings: 'this project (shared)',
  session: 'this session',
  cliArg: 'startup options'
}

export const DESTINATION_HINT: Record<PermissionDestination, string> = {
  localSettings: 'Saves to .claude/settings.local.json (gitignored)',
  userSettings: 'Saves to ~/.claude/settings.json',
  projectSettings: 'Saves to .claude/settings.json (shared with team)',
  session: 'Only for this session (not saved)',
  cliArg: 'From options set when the session started'
}

const MOST_SHARED_FIRST: string[] = ['userSettings', 'projectSettings', 'localSettings', 'session', 'cliArg']

export function nextDestination(current: PermissionDestination, step: 1 | -1): PermissionDestination {
  const at = DESTINATIONS.indexOf(current)
  if (at === -1) return DESTINATIONS[0]
  return DESTINATIONS[(at + step + DESTINATIONS.length) % DESTINATIONS.length]
}

export function initialDestination(suggestions: PermissionSuggestion[], remembered: string | null): PermissionDestination {
  if (remembered && (DESTINATIONS as string[]).includes(remembered)) return remembered as PermissionDestination
  const suggested = suggestions
    .map((s) => s.destination)
    .filter((d): d is string => typeof d === 'string' && MOST_SHARED_FIRST.includes(d))
    .sort((a, b) => MOST_SHARED_FIRST.indexOf(a) - MOST_SHARED_FIRST.indexOf(b))[0]
  return (suggested as PermissionDestination | undefined) ?? 'session'
}

export function alwaysAllowReply(
  input: ToolInput,
  suggestions: PermissionSuggestion[],
  destination: PermissionDestination
): AllowReply {
  return {
    behavior: 'allow',
    updatedInput: input,
    updatedPermissions: suggestions.map((s) => ({ ...s, destination: s.type === 'setMode' ? s.destination : destination }))
  }
}

export const PLAN_TOOL = 'ExitPlanMode'

export function planYes(autoAvailable: boolean): { label: string; mode: 'auto' | 'acceptEdits' } {
  return autoAvailable ? { label: 'Yes, and use auto mode', mode: 'auto' } : { label: 'Yes, and auto-accept', mode: 'acceptEdits' }
}

export function planManualReply(input: ToolInput): AllowReply {
  return { behavior: 'allow', updatedInput: input, updatedPermissions: [{ type: 'setMode', mode: 'default', destination: 'session' }] }
}

export function planDenyReply(feedback: string): DenyReply {
  if (!feedback.trim()) return { behavior: 'deny', message: 'User chose to stay in plan mode and continue planning', interrupt: true }
  return denyReply(feedback)
}

/** A `can_use_tool` request from a hosted session's CLI, waiting for the user. */
export interface ApprovalRequest {
  requestId: string
  paneId: string
  toolName: string
  input: ToolInput
  suggestions: PermissionSuggestion[]
  description?: string
  /** Why the CLI asks, shown only for its safety checks. */
  reason?: string
}

export type ApprovalReply = AllowReply | DenyReply

export interface ApprovalSettled {
  requestId: string
  paneId: string
}
