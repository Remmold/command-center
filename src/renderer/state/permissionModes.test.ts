import { describe, expect, it } from 'vitest'
import { MODE_INFO, availableModes, initialMode, migrateMode, migratePermissionModes, nextMode, unsetStoreDefault } from './permissionModes'

describe('permission modes', () => {
  it('offers Manual, Edit automatically and Plan, then Auto and Bypass when the CLI allows them', () => {
    expect(availableModes({ current: 'default', autoAvailable: false, bypassAvailable: false })).toEqual([
      'default',
      'acceptEdits',
      'plan'
    ])
    expect(availableModes({ current: 'default', autoAvailable: true, bypassAvailable: true })).toEqual([
      'default',
      'acceptEdits',
      'plan',
      'auto',
      'bypassPermissions'
    ])
  })

  it("keeps the current mode in the list: Don't ask first, Auto when it is on", () => {
    expect(availableModes({ current: 'dontAsk', autoAvailable: false, bypassAvailable: false })[0]).toBe('dontAsk')
    expect(availableModes({ current: 'auto', autoAvailable: false, bypassAvailable: false })).toContain('auto')
  })

  it('Shift+Tab steps to the next mode and wraps around', () => {
    const modes = availableModes({ current: 'default', autoAvailable: true, bypassAvailable: false })
    expect(nextMode(modes, 'default')).toBe('acceptEdits')
    expect(nextMode(modes, 'acceptEdits')).toBe('plan')
    expect(nextMode(modes, 'plan')).toBe('auto')
    expect(nextMode(modes, 'auto')).toBe('default')
  })

  it('uses the extension labels', () => {
    expect(MODE_INFO.default.label).toBe('Manual')
    expect(MODE_INFO.acceptEdits.label).toBe('Edit automatically')
    expect(MODE_INFO.plan.label).toBe('Plan')
    expect(MODE_INFO.auto.label).toBe('Auto')
    expect(MODE_INFO.bypassPermissions.label).toBe('Bypass permissions')
    expect(MODE_INFO.dontAsk.label).toBe("Don't ask")
  })

  it("moves saved modes to the CLI's names", () => {
    expect(migrateMode('ask')).toBe('default')
    expect(migrateMode('acceptEdits')).toBe('acceptEdits')
    expect(migrateMode('plan')).toBe('plan')
    expect(migrateMode('bypassPermissions')).toBe('bypassPermissions')
    expect(migrateMode(undefined)).toBe('default')
    expect(migrateMode('yolo')).toBe('default')
  })

  it('migrates every saved session and the default for new ones', () => {
    const saved = {
      views: { w: { claudeSessions: [{ id: 'a', permissionMode: 'ask' }, { id: 'b', permissionMode: 'plan' }] } },
      defaultPermissionMode: 'ask'
    }
    migratePermissionModes(saved)
    expect(saved).toEqual({
      views: { w: { claudeSessions: [{ id: 'a', permissionMode: 'default' }, { id: 'b', permissionMode: 'plan' }] } },
      defaultPermissionMode: 'default'
    })
  })

  describe('a new session starts', () => {
    it('in Manual when nothing is saved or set', () => {
      expect(initialMode({ picked: undefined, fromSettings: null, bypassAllowed: false })).toBe('default')
    })

    it("in the user settings' permissions.defaultMode", () => {
      expect(initialMode({ picked: undefined, fromSettings: 'plan', bypassAllowed: false })).toBe('plan')
      expect(initialMode({ picked: undefined, fromSettings: 'acceptEdits', bypassAllowed: false })).toBe('acceptEdits')
    })

    it('in the mode the user last picked, which wins over settings.json as in the extension', () => {
      expect(initialMode({ picked: 'acceptEdits', fromSettings: 'plan', bypassAllowed: false })).toBe('acceptEdits')
    })

    it('in Manual for an unknown mode, or bypass while bypass is not allowed', () => {
      expect(initialMode({ picked: undefined, fromSettings: 'yolo', bypassAllowed: false })).toBe('default')
      expect(initialMode({ picked: undefined, fromSettings: 'bypassPermissions', bypassAllowed: false })).toBe('default')
      expect(initialMode({ picked: undefined, fromSettings: 'bypassPermissions', bypassAllowed: true })).toBe('bypassPermissions')
    })
  })

  it("drops the store's old built-in default for new sessions, Edit automatically, and keeps other picks", () => {
    const old = { defaultPermissionMode: 'acceptEdits' }
    unsetStoreDefault(old)
    expect(old).toEqual({})
    const picked = { defaultPermissionMode: 'default' }
    unsetStoreDefault(picked)
    expect(picked).toEqual({ defaultPermissionMode: 'default' })
  })
})
