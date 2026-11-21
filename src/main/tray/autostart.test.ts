import { describe, expect, it } from 'vitest'
import { loginItemSettings, startWithWindowsState, startsHidden } from './autostart'

describe('startsHidden', () => {
  it('is true when launched at login with --hidden', () => {
    expect(startsHidden(['C:\app\Command Center.exe', '--hidden'])).toBe(true)
  })

  it('is false for a normal launch', () => {
    expect(startsHidden(['C:\app\Command Center.exe'])).toBe(false)
  })
})

describe('startWithWindowsState', () => {
  it('is disabled with a reason in a dev build, even if a login item exists', () => {
    expect(startWithWindowsState({ packaged: false, openAtLogin: true })).toEqual({
      checked: false,
      enabled: false,
      reason: 'installed app only'
    })
  })

  it('is checked when the installed app has a login item', () => {
    expect(startWithWindowsState({ packaged: true, openAtLogin: true })).toEqual({
      checked: true,
      enabled: true
    })
  })

  it('is unchecked when the installed app has no login item', () => {
    expect(startWithWindowsState({ packaged: true, openAtLogin: false })).toEqual({
      checked: false,
      enabled: true
    })
  })
})

describe('loginItemSettings', () => {
  it('registers a login launch that starts hidden', () => {
    const settings = loginItemSettings(true)
    expect(settings.openAtLogin).toBe(true)
    expect(startsHidden(['Command Center.exe', ...settings.args])).toBe(true)
  })

  it('removes the login launch with the same arguments it was registered with', () => {
    expect(loginItemSettings(false)).toEqual({ openAtLogin: false, args: loginItemSettings(true).args })
  })
})
