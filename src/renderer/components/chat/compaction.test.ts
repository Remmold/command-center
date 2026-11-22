import { describe, expect, it } from 'vitest'
import { compactLabel, pairCompactions } from './compaction'

describe('compaction line', () => {
  it('names the trigger and the tokens before compaction, in whole thousands', () => {
    expect(compactLabel({ trigger: 'auto', preTokens: 974_400 })).toBe('Compacted chat · auto · 974k tokens freed')
    expect(compactLabel({ trigger: 'manual', preTokens: 212_099 })).toBe('Compacted chat · manual · 212k tokens freed')
  })

  it('reads any trigger other than manual as auto, as the extension does', () => {
    expect(compactLabel({ trigger: 'something-new', preTokens: 1500 })).toBe('Compacted chat · auto · 2k tokens freed')
  })

  it('without the boundary data reads as the extension with none: auto, 0k', () => {
    expect(compactLabel(undefined)).toBe('Compacted chat · auto · 0k tokens freed')
  })
})

describe('pairing a compaction with its summary', () => {
  const boundary = { kind: 'system' as const, id: 'b', text: '', compact: { trigger: 'auto', preTokens: 5000 } }
  const summary = { kind: 'system' as const, id: 's', text: '', compactSummary: 'The summary.' }
  const prompt = { kind: 'user' as const, id: 'u', text: 'hi' }

  it('gives the boundary the summary that follows it and hides the summary', () => {
    const pairs = pairCompactions([prompt, boundary, summary])
    expect(pairs.summaryFor.get('b')).toBe('The summary.')
    expect(pairs.drawnInBoundary.has('s')).toBe(true)
  })

  it('leaves a summary with no boundary before it to be drawn on its own', () => {
    const pairs = pairCompactions([prompt, summary])
    expect(pairs.drawnInBoundary.has('s')).toBe(false)
  })

  it('does not pair across another item', () => {
    const pairs = pairCompactions([boundary, prompt, summary])
    expect(pairs.summaryFor.get('b')).toBeUndefined()
  })
})
