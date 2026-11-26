import { afterEach, describe, expect, it } from 'vitest'
import { setSettingsLeaveGuard, useViewStore } from './viewStore'

describe('the Settings leave guard', () => {
  afterEach(() => {
    setSettingsLeaveGuard(null)
    useViewStore.setState({ view: 'dashboard', settings: null })
  })

  it('keeps Settings on its section when the guard says stay: switching section, closing Settings or changing view', () => {
    useViewStore.getState().openSettings('claude-code')
    setSettingsLeaveGuard(() => false)
    useViewStore.getState().openSettings('general')
    useViewStore.getState().closeSettings()
    useViewStore.getState().setView('work')
    expect(useViewStore.getState()).toMatchObject({ settings: 'claude-code', view: 'dashboard' })
  })

  it('lets every move through when the guard agrees, and does not ask when the section stays', () => {
    let asked = 0
    useViewStore.getState().openSettings('claude-code')
    setSettingsLeaveGuard(() => {
      asked++
      return true
    })
    useViewStore.getState().openSettings('claude-code')
    expect(asked).toBe(0)
    useViewStore.getState().openSettings('general')
    expect(useViewStore.getState().settings).toBe('general')
    expect(asked).toBe(1)
  })
})
