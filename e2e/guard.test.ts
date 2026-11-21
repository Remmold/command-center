import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { FAKE_BIN, assertFakeClaude } from './guard'

describe('assertFakeClaude', () => {
  it('accepts the repo fake', () => {
    expect(() => assertFakeClaude(FAKE_BIN)).not.toThrow()
  })

  it('accepts the fake given with a relative path', () => {
    expect(() => assertFakeClaude(join('tools', 'fake-claude', '..', 'fake-claude', 'fake-claude.mjs'))).not.toThrow()
  })

  it.each([undefined, '', 'claude', String.raw`C:\Users\someone\.local\bin\claude.exe`, join(FAKE_BIN, '..', 'other.mjs')])(
    'refuses %s',
    (bin) => {
      expect(() => assertFakeClaude(bin)).toThrow(/e2e refuses to run/)
    }
  )
})
