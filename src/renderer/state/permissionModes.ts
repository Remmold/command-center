export type PermissionMode = 'default' | 'acceptEdits' | 'plan' | 'auto' | 'bypassPermissions' | 'dontAsk'

const ALL_MODES: PermissionMode[] = ['default', 'acceptEdits', 'plan', 'auto', 'bypassPermissions', 'dontAsk']

export const MODE_INFO: Record<PermissionMode, { label: string; description: string }> = {
  default: { label: 'Manual', description: 'Claude will ask for approval before making each edit' },
  acceptEdits: { label: 'Edit automatically', description: 'Claude will edit your selected text or the whole file' },
  plan: { label: 'Plan', description: 'Claude will explore the code and present a plan before editing' },
  auto: { label: 'Auto', description: 'Claude will approve actions that pass a safety check and pause for anything risky' },
  bypassPermissions: {
    label: 'Bypass permissions',
    description: 'Claude will not ask for approval before running potentially dangerous commands'
  },
  dontAsk: { label: "Don't ask", description: 'Claude will deny actions that need approval instead of asking' }
}

export function isPermissionMode(value: unknown): value is PermissionMode {
  return typeof value === 'string' && (ALL_MODES as string[]).includes(value)
}

export interface ModeAvailability {
  current: PermissionMode
  autoAvailable: boolean
  bypassAvailable: boolean
}

/** The picker's modes, which are also the Shift+Tab cycle. */
export function availableModes({ current, autoAvailable, bypassAvailable }: ModeAvailability): PermissionMode[] {
  const modes: PermissionMode[] = ['default', 'acceptEdits', 'plan']
  if (current === 'dontAsk') modes.unshift('dontAsk')
  if (autoAvailable || current === 'auto') modes.push('auto')
  if (bypassAvailable) modes.push('bypassPermissions')
  return modes
}

export function nextMode(modes: PermissionMode[], current: PermissionMode): PermissionMode {
  return modes[(modes.indexOf(current) + 1) % modes.length]
}

/** Saved sessions predate the CLI's names; the app called Manual "ask". */
export function migrateMode(saved: unknown): PermissionMode {
  return isPermissionMode(saved) ? saved : 'default'
}

export interface SavedModes {
  views?: Record<string, { claudeSessions: Array<{ permissionMode?: unknown }> }>
  defaultPermissionMode?: unknown
}

/** Mutates the saved state in place, like the other migration steps. */
export function migratePermissionModes(state: SavedModes): void {
  for (const v of Object.values(state.views ?? {})) {
    v.claudeSessions = v.claudeSessions.map((c) => ({ ...c, permissionMode: migrateMode(c.permissionMode) }))
  }
  if (state.defaultPermissionMode !== undefined) state.defaultPermissionMode = migrateMode(state.defaultPermissionMode)
}
