import type { SettingsLayer, SourceLayer } from './claudeSettings'

export const SETTING_CATEGORIES = [
  'Model & thinking',
  'Permissions',
  'Hooks',
  'Interface',
  'Memory & context',
  'Git & attribution',
  'MCP servers',
  'Plugins & skills',
  'Agents & worktrees',
  'Remote & notifications',
  'Updates, privacy & sign-in',
  'Environment',
  'Key bindings',
  'Other keys'
] as const

export type SettingCategory = (typeof SETTING_CATEGORIES)[number]

export interface ChoiceOption {
  value: string
  label: string
  /** The layers this value counts in, when fewer than the setting's. */
  layers?: readonly SettingsLayer[]
}

export type SettingControl =
  | { kind: 'toggle' }
  | { kind: 'choice'; options: ChoiceOption[] }
  | { kind: 'number'; min?: number; max?: number }
  | { kind: 'text'; placeholder?: string }
  | { kind: 'stringList' }
  | { kind: 'editor'; editor: 'permissions' | 'hooks' | 'environment' | 'statusLine' | 'keyBindings' | 'otherKeys' }

export interface SettingEntry {
  /** Dot-separated path in the settings file. */
  key: string
  label: string
  description: string
  category: SettingCategory
  control: SettingControl
  /** What Claude uses when no layer sets the key; undefined when it depends on the model or plan. */
  default?: unknown
  /** Shown as "Default: …" instead of the formatted default. */
  defaultLabel?: string
  layers: readonly SettingsLayer[]
  terminalOnly: boolean
  /** Claude reads it only when a chat starts. */
  newChatsOnly: boolean
  advanced: boolean
  /** A warning for a risky value, else null. */
  risk?: (value: unknown) => string | null
  /** An object Claude takes whole from the highest layer that sets it, instead of combining it per key. */
  whole?: boolean
  /** A stricter value that wins from any of these layers, over every other layer (the docs' exceptions). */
  stricter?: { value: unknown; from: readonly SourceLayer[] }
}

const ALL_LAYERS: readonly SettingsLayer[] = ['account', 'repo', 'local']
const ACCOUNT_ONLY: readonly SettingsLayer[] = ['account']
const NOT_REPO: readonly SettingsLayer[] = ['account', 'local']

export const LAYER_NAMES: Record<SourceLayer, string> = { organisation: 'Organisation', account: 'Account', repo: 'Repo', local: 'Local' }

export const layerList = (layers: readonly SourceLayer[]): string => {
  const names = layers.map((l) => LAYER_NAMES[l])
  return names.length === 1 ? names[0] : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`
}

/** Why a setting, or this value of it, does not count in the layer; null when it does. */
export function layerRule(entry: SettingEntry, layer: SettingsLayer, value?: unknown): string | null {
  if (!entry.layers.includes(layer)) return `Claude reads this only from ${layerList(entry.layers)} settings.`
  if (entry.control.kind !== 'choice') return null
  const option = entry.control.options.find((o) => o.value === value)
  if (option?.layers && !option.layers.includes(layer)) return `${option.label} counts only from ${layerList(option.layers)} settings; Claude ignores it here.`
  return null
}

/** Whether Claude reads `value` for this setting from the layer. */
export const countsIn = (entry: SettingEntry, layer: SourceLayer, value: unknown): boolean => layer === 'organisation' || layerRule(entry, layer, value) === null

const MODEL_OPTIONS: ChoiceOption[] = [
  { value: 'opus', label: 'Opus' },
  { value: 'sonnet', label: 'Sonnet' },
  { value: 'haiku', label: 'Haiku' },
  { value: 'opus[1m]', label: 'Opus, 1M context' },
  { value: 'sonnet[1m]', label: 'Sonnet, 1M context' },
  { value: 'opusplan', label: 'Opus to plan, Sonnet to build' }
]

export const SETTINGS_CATALOG: readonly SettingEntry[] = [
  {
    key: 'model',
    label: 'Model',
    description: 'The model new chats start on. The model picker in a chat saves its pick here too.',
    category: 'Model & thinking',
    control: { kind: 'choice', options: MODEL_OPTIONS },
    defaultLabel: "Claude's default for your plan",
    layers: ALL_LAYERS,
    terminalOnly: false,
    newChatsOnly: true,
    advanced: false
  },
  {
    key: 'alwaysThinkingEnabled',
    label: 'Extended thinking',
    description: 'Lets Claude think before it answers, in every chat.',
    category: 'Model & thinking',
    control: { kind: 'toggle' },
    defaultLabel: "the model's default",
    layers: ALL_LAYERS,
    terminalOnly: false,
    newChatsOnly: true,
    advanced: false
  },
  {
    key: 'modelPicker',
    label: 'Model picker list',
    description: 'Which models the model picker lists, in your order and with your labels.',
    category: 'Model & thinking',
    control: { kind: 'editor', editor: 'otherKeys' },
    defaultLabel: 'the built-in list',
    layers: ACCOUNT_ONLY,
    terminalOnly: false,
    newChatsOnly: false,
    advanced: false,
    whole: true
  },
  {
    key: 'permissions.defaultMode',
    label: 'Permission mode',
    description: 'The permission mode new chats start in.',
    category: 'Permissions',
    control: {
      kind: 'choice',
      options: [
        { value: 'default', label: 'Ask before edits and commands' },
        { value: 'acceptEdits', label: 'Accept edits' },
        { value: 'plan', label: 'Plan first' },
        { value: 'dontAsk', label: 'Don’t ask, deny what isn’t allowed' },
        { value: 'auto', label: 'Auto', layers: ACCOUNT_ONLY },
        { value: 'bypassPermissions', label: 'Skip all permission prompts', layers: ACCOUNT_ONLY }
      ]
    },
    default: 'default',
    layers: ALL_LAYERS,
    terminalOnly: false,
    newChatsOnly: true,
    advanced: false,
    risk: (value) => (value === 'bypassPermissions' ? 'Claude runs every tool without asking, including commands that delete or overwrite files.' : null)
  },
  {
    key: 'permissions.denyInsteadOfPrompting',
    label: 'Deny instead of asking',
    description: 'Refuses a tool call that would otherwise wait for your approval.',
    category: 'Permissions',
    control: { kind: 'toggle' },
    default: false,
    layers: ACCOUNT_ONLY,
    terminalOnly: false,
    newChatsOnly: false,
    advanced: false,
    stricter: { value: true, from: ['account'] }
  },
  {
    key: 'autoMode',
    label: 'Auto mode rules',
    description: 'Your own allow and deny rules for the auto mode classifier.',
    category: 'Permissions',
    control: { kind: 'editor', editor: 'otherKeys' },
    defaultLabel: 'the built-in rules',
    layers: ACCOUNT_ONLY,
    terminalOnly: false,
    newChatsOnly: false,
    advanced: false
  },
  {
    key: 'useAutoModeDuringPlan',
    label: 'Auto mode while planning',
    description: 'The classifier reviews shell commands in plan mode; off asks you instead.',
    category: 'Permissions',
    control: { kind: 'toggle' },
    default: true,
    layers: NOT_REPO,
    terminalOnly: false,
    newChatsOnly: false,
    advanced: false,
    stricter: { value: false, from: ['organisation', 'local', 'account'] }
  },
  {
    key: 'skipDangerousModePermissionPrompt',
    label: 'Skip the bypass-mode warning',
    description: 'Starts in "skip all permission prompts" mode without asking you to confirm first.',
    category: 'Permissions',
    control: { kind: 'toggle' },
    default: false,
    layers: NOT_REPO,
    terminalOnly: false,
    newChatsOnly: false,
    advanced: false,
    risk: (value) => (value === true ? 'Nothing asks before Claude starts with every permission prompt skipped.' : null)
  },
  {
    key: 'askUserQuestionTimeout',
    label: 'Answer questions for me after',
    description: 'A question Claude asks with no answer goes on with the options already picked after this long.',
    category: 'Interface',
    control: {
      kind: 'choice',
      options: [
        { value: '60s', label: '1 minute' },
        { value: '5m', label: '5 minutes' },
        { value: '10m', label: '10 minutes' },
        { value: 'never', label: 'Never' }
      ]
    },
    default: 'never',
    layers: ACCOUNT_ONLY,
    terminalOnly: false,
    newChatsOnly: false,
    advanced: false
  },
  {
    key: 'syncClaudeAiSkills',
    label: 'Sync claude.ai skills',
    description: 'Downloads and loads the skills you have on claude.ai. Only off counts.',
    category: 'Plugins & skills',
    control: { kind: 'toggle' },
    default: true,
    layers: NOT_REPO,
    terminalOnly: false,
    newChatsOnly: true,
    advanced: false,
    stricter: { value: false, from: ['organisation', 'local', 'account'] }
  },
  {
    key: 'syncClaudeAiPlugins',
    label: 'Sync claude.ai plugins',
    description: 'Downloads and loads the plugins you have on claude.ai. Only off counts.',
    category: 'Plugins & skills',
    control: { kind: 'toggle' },
    default: true,
    layers: NOT_REPO,
    terminalOnly: false,
    newChatsOnly: true,
    advanced: false,
    stricter: { value: false, from: ['organisation', 'local', 'account'] }
  }
]

/** The catalog's entry for a key, else a plain one for a key the page has no control for. */
export function entryFor(key: string): SettingEntry {
  return (
    SETTINGS_CATALOG.find((e) => e.key === key) ?? {
      key,
      label: key,
      description: '',
      category: 'Other keys',
      control: { kind: 'editor', editor: 'otherKeys' },
      layers: ALL_LAYERS,
      terminalOnly: false,
      newChatsOnly: false,
      advanced: false
    }
  )
}

export function formatSettingValue(entry: SettingEntry, value: unknown): string {
  if (value === undefined) return 'not set'
  if (entry.control.kind === 'toggle' && typeof value === 'boolean') return value ? 'on' : 'off'
  if (entry.control.kind === 'choice') {
    const option = entry.control.options.find((o) => o.value === value)
    if (option) return option.label
  }
  if (Array.isArray(value) && value.every((v) => typeof v === 'string')) return value.length === 0 ? 'none' : value.join(', ')
  return typeof value === 'string' ? value : JSON.stringify(value)
}

export function defaultText(entry: SettingEntry): string {
  return `Default: ${entry.defaultLabel ?? formatSettingValue(entry, entry.default)}`
}
