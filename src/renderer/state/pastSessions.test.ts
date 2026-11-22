import { describe, expect, it } from 'vitest'
import type { LocalSessionInfo } from '../../shared/types'
import { matchesSearch, pastSessionDot, sessionAge } from './pastSessions'

const NOW = Date.UTC(2026, 10, 22, 12, 0, 0)
const ago = (ms: number) => sessionAge(NOW - ms, NOW)
const MIN = 60_000
const DAY = 24 * 60 * MIN

describe('past session age', () => {
  it('reads like the extension: now, minutes, hours, days, months, years', () => {
    expect(ago(59_000)).toBe('now')
    expect(ago(5 * MIN)).toBe('5m')
    expect(ago(3 * 60 * MIN)).toBe('3h')
    expect(ago(2 * DAY)).toBe('2d')
    expect(ago(29 * DAY)).toBe('29d')
    expect(ago(30 * DAY)).toBe('1mo')
    expect(ago(400 * DAY)).toBe('1y')
  })
})

describe('past session status dot', () => {
  it('shows the open session in this window with its state', () => {
    expect(pastSessionDot({ hosted: 'running' })).toEqual({ state: 'running', tooltip: 'Open in this window — running' })
    expect(pastSessionDot({ hosted: 'needs-approval' })).toEqual({ state: 'waiting', tooltip: 'Open in this window — awaiting input' })
    expect(pastSessionDot({ hosted: 'your-turn' })).toEqual({ state: 'idle', tooltip: 'Open in this window' })
    expect(pastSessionDot({ hosted: 'idle' })).toEqual({ state: 'idle', tooltip: 'Open in this window' })
  })

  it('shows a session followed from VS Code as open in another window', () => {
    expect(pastSessionDot({ observed: 'live' })).toEqual({ state: 'running', tooltip: 'Open in another VS Code window — running' })
    expect(pastSessionDot({ observed: 'quiet' })).toEqual({ state: 'idle', tooltip: 'Open in another VS Code window' })
  })

  it('has no dot for a session open nowhere', () => {
    expect(pastSessionDot({})).toBeNull()
  })
})

describe('searching past sessions', () => {
  const session: LocalSessionInfo = {
    sessionId: 's',
    modifiedAt: 0,
    title: 'Fix the Login bug',
    titleSource: 'claude',
    preview: 'please look at auth',
    gitBranch: 'feature/oauth'
  }

  it('matches the title or the git branch, ignoring case', () => {
    expect(matchesSearch(session, 'login')).toBe(true)
    expect(matchesSearch(session, 'OAUTH')).toBe(true)
    expect(matchesSearch(session, '')).toBe(true)
  })

  it('does not match the prompt text or session id', () => {
    expect(matchesSearch(session, 'please')).toBe(false)
    expect(matchesSearch({ ...session, gitBranch: undefined }, 'oauth')).toBe(false)
  })
})
