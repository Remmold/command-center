import { describe, expect, it } from 'vitest'
import { isPairFlipKey } from './pairHotkey'

const press = (over: Partial<Parameters<typeof isPairFlipKey>[0]> = {}) => ({ type: 'keyDown', key: 'F6', control: false, alt: false, shift: false, meta: false, ...over })

describe('pair flip hotkey', () => {
  it('is a bare F6 press', () => {
    expect(isPairFlipKey(press())).toBe(true)
  })

  it('ignores the key release, other keys and modified F6', () => {
    expect(isPairFlipKey(press({ type: 'keyUp' }))).toBe(false)
    expect(isPairFlipKey(press({ key: 'F5' }))).toBe(false)
    expect(isPairFlipKey(press({ control: true }))).toBe(false)
    expect(isPairFlipKey(press({ shift: true }))).toBe(false)
    expect(isPairFlipKey(press({ alt: true }))).toBe(false)
  })
})
