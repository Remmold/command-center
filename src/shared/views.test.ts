import { describe, expect, it } from 'vitest'
import { parseView } from './views'

describe('app view', () => {
  it('keeps each current view', () => {
    expect(parseView('dashboard')).toBe('dashboard')
    expect(parseView('work')).toBe('work')
    expect(parseView('board')).toBe('board')
    expect(parseView('context')).toBe('context')
    expect(parseView('processes')).toBe('processes')
    expect(parseView('3d')).toBe('3d')
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
