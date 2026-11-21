import { describe, expect, it } from 'vitest'
import { MODE_INFO, availableModes, migrateMode, migratePermissionModes, nextMode } from './permissionModes'

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
})
