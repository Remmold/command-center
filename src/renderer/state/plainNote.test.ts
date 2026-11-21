import { describe, expect, it } from 'vitest'
import { plainNote } from './plainNote'

describe('plain note', () => {
  it('drops bold markers', () => {
    expect(plainNote('ticket **11** done')).toBe('ticket 11 done')
  })

  it('drops italic markers, star or underscore', () => {
    expect(plainNote('a *quick* and _tidy_ fix')).toBe('a quick and tidy fix')
  })

  it('keeps underscores inside words', () => {
    expect(plainNote('set snake_case_name')).toBe('set snake_case_name')
  })

  it('drops inline code backticks', () => {
    expect(plainNote('fixed `useChatItemsStore` crash')).toBe('fixed useChatItemsStore crash')
  })

  it('keeps markdown characters inside inline code as written', () => {
    expect(plainNote('globbed `**/*.test.ts` and `snake_case_` files')).toBe('globbed **/*.test.ts and snake_case_ files')
  })

  it('turns a link into its text', () => {
    expect(plainNote('see [the spec](docs/spec.md#views) first')).toBe('see the spec first')
  })

  it('drops a leading list marker', () => {
    expect(plainNote('- 05 resolved: dashboard')).toBe('05 resolved: dashboard')
  })

  it('cleans a real progress line', () => {
    expect(plainNote('- 03 resolved: **11** rows in `state/sessionList.ts`, see [ADR](docs/adr/0003_x.md)')).toBe(
      '03 resolved: 11 rows in state/sessionList.ts, see ADR'
    )
  })
})
