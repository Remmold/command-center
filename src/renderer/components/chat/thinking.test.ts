import { describe, expect, it } from 'vitest'
import { thinkingLabel, thinkingTokensLabel } from './thinking'

describe('thinking label', () => {
  it('reads "Thinking..." while the block is still streaming', () => {
    expect(thinkingLabel({ streaming: true, durationMs: 4000 })).toBe('Thinking...')
  })

  it('reads "Thought for Ns" with the duration rounded to whole seconds', () => {
    expect(thinkingLabel({ streaming: false, durationMs: 3400 })).toBe('Thought for 3s')
    expect(thinkingLabel({ streaming: false, durationMs: 3500 })).toBe('Thought for 4s')
    expect(thinkingLabel({ streaming: false, durationMs: 200 })).toBe('Thought for 0s')
  })

  it('reads "Thinking" when no duration is known, e.g. a block loaded from a transcript', () => {
    expect(thinkingLabel({ streaming: false, durationMs: undefined })).toBe('Thinking')
  })
})

describe('live thinking token estimate', () => {
  it('shows small counts as they are and larger ones in thousands', () => {
    expect(thinkingTokensLabel(258)).toBe('258 tokens')
    expect(thinkingTokensLabel(1250)).toBe('1.3k tokens')
  })

  it('shows nothing for no estimate', () => {
    expect(thinkingTokensLabel(undefined)).toBeNull()
    expect(thinkingTokensLabel(0)).toBeNull()
  })
})
