import { isSettingsObject } from './claudeSettings'

export type StatusLineKey = 'statusLine' | 'subagentStatusLine'

export interface StatusLineOption {
  key: 'padding' | 'refreshInterval' | 'hideVimModeIndicator'
  label: string
  description: string
  kind: 'number' | 'toggle'
  min?: number
  /** Whole numbers only. */
  integer?: boolean
}

/** The options beside the command; a subagent's status line has none. */
export const STATUS_LINE_OPTIONS: Record<StatusLineKey, readonly StatusLineOption[]> = {
  statusLine: [
    { key: 'padding', label: 'Extra space', description: 'Spaces added beside the line. Default: 0.', kind: 'number', min: 0 },
    { key: 'refreshInterval', label: 'Rerun every (seconds)', description: 'Also reruns the command on a timer, for a clock or the like. Empty: only when something happens.', kind: 'number', min: 1, integer: true },
    { key: 'hideVimModeIndicator', label: 'Hide the vim mode', description: 'For a command that shows the vim mode itself.', kind: 'toggle' }
  ],
  subagentStatusLine: []
}

export const STATUS_LINE_HELP: Record<StatusLineKey, string> = {
  statusLine: 'Claude runs the command whenever the chat changes, passes it the chat’s details (model, folder, cost, context used) as JSON on its input, and shows what it prints under the input box.',
  subagentStatusLine: 'Claude runs the command for each subagent, with the subagent’s details as JSON on its input, and shows what it prints as that subagent’s line.'
}

export const isStatusLineKey = (key: string): key is StatusLineKey => key === 'statusLine' || key === 'subagentStatusLine'

function optionFits(option: StatusLineOption, value: unknown): boolean {
  if (option.kind === 'toggle') return typeof value === 'boolean'
  return typeof value === 'number' && Number.isFinite(value) && value >= (option.min ?? -Infinity) && (!option.integer || Number.isInteger(value))
}

/** Whether the editor can show the whole value: a command status line with known options only. */
export function isEditableStatusLine(key: StatusLineKey, value: unknown): value is { type: 'command'; command: string } & Record<string, unknown> {
  if (!isSettingsObject(value) || value.type !== 'command' || typeof value.command !== 'string') return false
  return Object.entries(value).every(([name, inner]) => {
    if (name === 'type' || name === 'command') return true
    const option = STATUS_LINE_OPTIONS[key].find((o) => o.key === name)
    return option !== undefined && optionFits(option, inner)
  })
}

/** A status line the editor can't show goes whole to Other keys. */
export const statusLineLeftOut =
  (key: StatusLineKey) =>
  (value: unknown): string[][] =>
    isEditableStatusLine(key, value) ? [] : [[]]
