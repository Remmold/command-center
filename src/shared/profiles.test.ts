import { describe, expect, it } from 'vitest'
import { defaultProfileName, profileEnv } from './profiles'
import { DEFAULT_PROFILE_ID } from './types'

const DEFAULT = { id: DEFAULT_PROFILE_ID, configDir: 'C:\\Users\\me\\.claude' }
const WORK = { id: 'work', configDir: 'C:\\data\\profiles\\work' }

describe('profileEnv', () => {
  it('leaves the config folder unset for Default', () => {
    expect(profileEnv(DEFAULT)).toEqual({})
  })

  it('points another profile at its own folder', () => {
    expect(profileEnv(WORK)).toEqual({ CLAUDE_CONFIG_DIR: WORK.configDir })
  })

  it('under the fake CLI, passes Default its harness folder so the app and the CLI read the same one', () => {
    expect(profileEnv(DEFAULT, 'C:\\tmp\\claude-config')).toEqual({ CLAUDE_CONFIG_DIR: 'C:\\tmp\\claude-config' })
    expect(profileEnv(WORK, 'C:\\tmp\\claude-config')).toEqual({ CLAUDE_CONFIG_DIR: WORK.configDir })
  })
})

describe('defaultProfileName', () => {
  it('calls the default account Personal until it is renamed', () => {
    expect(defaultProfileName(undefined)).toBe('Personal')
    expect(defaultProfileName({})).toBe('Personal')
    expect(defaultProfileName({ name: '   ' })).toBe('Personal')
  })

  it('keeps the name it was given in Settings', () => {
    expect(defaultProfileName({ name: ' Home ' })).toBe('Home')
  })
})
