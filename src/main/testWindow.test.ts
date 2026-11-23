import { describe, expect, it } from 'vitest'
import { windowOffscreen } from './testWindow'

describe('test windows stay off the user’s screen', () => {
  it('keeps a window launched on the fake CLI off-screen', () => {
    expect(windowOffscreen({ CC_CLAUDE_BIN: 'C:\\repo\\tools\\fake-claude\\fake-claude.mjs' })).toBe(true)
  })

  it('shows the real app normally', () => {
    expect(windowOffscreen({})).toBe(false)
    expect(windowOffscreen({ CC_CLAUDE_BIN: 'C:\\Users\\x\\.local\\bin\\claude.exe' })).toBe(false)
  })

  it('lets CC_OFFSCREEN override either way', () => {
    expect(windowOffscreen({ CC_OFFSCREEN: '1' })).toBe(true)
    expect(windowOffscreen({ CC_OFFSCREEN: '0', CC_CLAUDE_BIN: 'tools/fake-claude/fake-claude.mjs' })).toBe(false)
  })
})
