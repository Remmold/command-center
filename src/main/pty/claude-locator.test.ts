import { afterEach, describe, expect, it } from 'vitest'
import { harnessConfigDir, locateClaude } from './claude-locator'

const FAKE = 'C:\\repo\\tools\\fake-claude\\fake-claude.mjs'

afterEach(() => {
  delete process.env.CC_CLAUDE_BIN
})

describe('locateClaude', () => {
  it('runs the fake CLI from CC_CLAUDE_BIN with this process as Node', () => {
    process.env.CC_CLAUDE_BIN = FAKE
    expect(locateClaude()).toEqual({ command: process.execPath, args: [FAKE], env: { ELECTRON_RUN_AS_NODE: '1' } })
  })

  it('follows a change of CC_CLAUDE_BIN', () => {
    process.env.CC_CLAUDE_BIN = FAKE
    locateClaude()
    process.env.CC_CLAUDE_BIN = 'D:\\other.mjs'
    expect(locateClaude().args).toEqual(['D:\\other.mjs'])
  })
})

describe('harnessConfigDir', () => {
  it('is CLAUDE_CONFIG_DIR when the fake CLI is in use', () => {
    expect(harnessConfigDir({ CC_CLAUDE_BIN: FAKE, CLAUDE_CONFIG_DIR: '/tmp/cfg' })).toBe('/tmp/cfg')
  })

  it('is null for a normal launch, even with CLAUDE_CONFIG_DIR inherited', () => {
    expect(harnessConfigDir({ CLAUDE_CONFIG_DIR: '/tmp/cfg' })).toBeNull()
    expect(harnessConfigDir({ CC_CLAUDE_BIN: FAKE })).toBeNull()
  })
})
