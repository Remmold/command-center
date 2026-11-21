import { DEFAULT_PROFILE_ID } from './types'

export const CONFIG_DIR_VAR = 'CLAUDE_CONFIG_DIR'

/** Variables a process needs to run as this profile; Default leaves the config folder unset. */
export function profileEnv(profile: { id: string; configDir: string }): Record<string, string> {
  return profile.id === DEFAULT_PROFILE_ID ? {} : { [CONFIG_DIR_VAR]: profile.configDir }
}
