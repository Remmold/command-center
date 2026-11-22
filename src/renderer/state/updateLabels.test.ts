import { describe, expect, it } from 'vitest'
import type { UpdateStatus } from '../../shared/types'
import { lastCheckLabel } from './updateLabels'

const base: UpdateStatus = { version: '0.1.1', lastCheck: null, checking: false, downloaded: null, error: null, afterUpdate: false }
const AT = Date.UTC(2026, 10, 22, 14, 7, 42)

describe('last check label', () => {
  it('says so before the first check', () => {
    expect(lastCheckLabel(base, 'UTC')).toBe('Not checked yet')
  })
  it('shows a running check', () => {
    expect(lastCheckLabel({ ...base, lastCheck: AT, checking: true }, 'UTC')).toBe('Checking…')
  })
  it('names the time of the last good check', () => {
    expect(lastCheckLabel({ ...base, lastCheck: AT }, 'UTC')).toBe('Last checked 2026-11-22 14:07:42 UTC')
  })
  it('names a downloaded version first', () => {
    expect(lastCheckLabel({ ...base, lastCheck: AT, downloaded: '0.1.2' }, 'UTC')).toBe('Version 0.1.2 is ready · last checked 2026-11-22 14:07:42 UTC')
  })
  it('shows why the last check failed', () => {
    expect(lastCheckLabel({ ...base, lastCheck: AT, error: 'net::ERR_INTERNET_DISCONNECTED' }, 'UTC')).toBe(
      'Check failed 2026-11-22 14:07:42 UTC: net::ERR_INTERNET_DISCONNECTED'
    )
  })
})
