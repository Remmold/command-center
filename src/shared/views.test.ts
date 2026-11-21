import { describe, expect, it } from 'vitest'
import { DEFAULT_VIEW, parseView } from './views'

describe('app view', () => {
  it('opens on the Dashboard', () => {
    expect(DEFAULT_VIEW).toBe('dashboard')
  })

  it('keeps each current view', () => {
    expect(parseView('dashboard')).toBe('dashboard')
    expect(parseView('work')).toBe('work')
    expect(parseView('board')).toBe('board')
  })

  it('reads the old Sessions view as Work', () => {
    expect(parseView('sessions')).toBe('work')
  })

  it('falls back to the Dashboard for anything else', () => {
    expect(parseView('settings')).toBe('dashboard')
    expect(parseView(undefined)).toBe('dashboard')
    expect(parseView(2)).toBe('dashboard')
  })
})
