import type { SettingsLayer } from './claudeSettings'

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
}

const ALL_LAYERS: readonly SettingsLayer[] = ['account', 'repo', 'local']

const EFFORT_OPTIONS: ChoiceOption[] = [
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
  { value: 'xhigh', label: 'Extra high' }
]

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
    key: 'effortLevel',
    label: 'Effort',
    description: 'How hard Claude thinks in new chats, for a model with no effort of its own saved by the effort picker.',
    category: 'Model & thinking',
    control: { kind: 'choice', options: EFFORT_OPTIONS },
    defaultLabel: "the model's default",
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
  }
]

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
