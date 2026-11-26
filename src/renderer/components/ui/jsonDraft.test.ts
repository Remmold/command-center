import { describe, expect, it } from 'vitest'
import { draftFor, isUnparsed, leaveDraft, typeDraft, valueChanged } from './jsonDraft'

describe('a raw JSON box', () => {
  it('takes a value changed from outside while nothing is typed in it', () => {
    const box = valueChanged(draftFor(1), 2)
    expect(box.draft).toBe('2')
    expect(isUnparsed(box)).toBe(false)
  })

  it('keeps the text being typed when its value changes from outside, still unparsed', () => {
    const box = valueChanged(typeDraft(draftFor({ a: 1 }), '{ "a": 5'), { a: 2 })
    expect(box.draft).toBe('{ "a": 5')
    expect(isUnparsed(box)).toBe(true)
  })

  it('on leaving, gives the parsed value of changed text, and is clean once that value comes back', () => {
    const { box, parsed } = leaveDraft(typeDraft(draftFor(1), ' 7 '))
    expect(parsed).toEqual({ value: 7 })
    expect(isUnparsed(valueChanged(box, 7))).toBe(false)
  })

  it('on leaving, keeps text that does not parse, with its message, and gives nothing', () => {
    const { box, parsed } = leaveDraft(typeDraft(draftFor(1), '{ nope'))
    expect(parsed).toBeUndefined()
    expect(box.error).toMatch(/./)
    expect(box.draft).toBe('{ nope')
    expect(isUnparsed(box)).toBe(true)
  })

  it('is clean again when the text is typed back to the value', () => {
    expect(isUnparsed(typeDraft(typeDraft(draftFor(true), 'tru'), 'true'))).toBe(false)
  })
})
