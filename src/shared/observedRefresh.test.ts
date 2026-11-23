import { describe, expect, it } from 'vitest'
import { OBSERVED_REFRESH_MS, observedRefreshMs } from './observedRefresh'

const FAKE = { CC_CLAUDE_BIN: 'tools/fake-claude/fake-claude.mjs' }

describe('observedRefreshMs', () => {
  it('is the normal interval in real use, even with the override set', () => {
    expect(observedRefreshMs({})).toBe(OBSERVED_REFRESH_MS)
    expect(observedRefreshMs({ CC_OBSERVED_REFRESH_MS: '500' })).toBe(OBSERVED_REFRESH_MS)
  })

  it('takes the override on the fake CLI', () => {
    expect(observedRefreshMs({ ...FAKE, CC_OBSERVED_REFRESH_MS: '500' })).toBe(500)
  })

  it.each(['', '0', '-5', 'soon'])('ignores an override of %j', (value) => {
    expect(observedRefreshMs({ ...FAKE, CC_OBSERVED_REFRESH_MS: value })).toBe(OBSERVED_REFRESH_MS)
  })
})
