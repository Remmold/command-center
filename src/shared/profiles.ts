import { DEFAULT_PROFILE_ID } from './types'

export const CONFIG_DIR_VAR = 'CLAUDE_CONFIG_DIR'

/**
 * Variables a process needs to run as this profile. Default leaves the config folder unset,
 * except under the fake CLI, where `harnessDir` is the temp folder the app reads for Default.
 */
export function profileEnv(profile: { id: string; configDir: string }, harnessDir: string | null = null): Record<string, string> {
  if (profile.id !== DEFAULT_PROFILE_ID) return { [CONFIG_DIR_VAR]: profile.configDir }
  return harnessDir ? { [CONFIG_DIR_VAR]: harnessDir } : {}
}

export function removalConfirmText(profile: { name: string; configDir: string }): string {
  return `Remove ${profile.name}? Command Center forgets this account; the folder ${profile.configDir} stays on disk, untouched. Workspaces that used it go back to the default account.`
}

export const DEFAULT_PROFILE_NAME = 'Personal'

/** The default account's display name, from its saved file; "Personal" until renamed. */
export function defaultProfileName(saved: unknown): string {
  const name = saved && typeof saved === 'object' ? (saved as { name?: unknown }).name : undefined
  return typeof name === 'string' && name.trim() ? name.trim() : DEFAULT_PROFILE_NAME
}
