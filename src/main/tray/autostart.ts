/** Passed by the login item so a Windows-login launch starts in the tray. */
export const HIDDEN_ARG = '--hidden'

export function startsHidden(argv: readonly string[]): boolean {
  return argv.includes(HIDDEN_ARG)
}

export interface StartWithWindowsState {
  checked: boolean
  enabled: boolean
  /** Shown in the label when the item is disabled, e.g. why autostart isn't offered. */
  reason?: string
}

/** Dev builds would register the bare electron.exe, so autostart is installed-app only. */
export function startWithWindowsState(input: {
  packaged: boolean
  launchesAtLogin: boolean
}): StartWithWindowsState {
  if (!input.packaged) return { checked: false, enabled: false, reason: 'installed app only' }
  return { checked: input.launchesAtLogin, enabled: true }
}

/** Windows matches a login item by path and args, so reads and writes must pass these same args. */
export function loginItemSettings(openAtLogin: boolean): { openAtLogin: boolean; args: string[] } {
  return { openAtLogin, args: [HIDDEN_ARG] }
}
