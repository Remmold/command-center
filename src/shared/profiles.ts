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
