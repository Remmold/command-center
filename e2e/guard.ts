import { existsSync } from 'node:fs'
import { join, resolve } from 'node:path'

export const FAKE_BIN = join(resolve(__dirname, '..'), 'tools', 'fake-claude', 'fake-claude.mjs')

/** The suite must never reach the real CLI: anything but this repo's fake stops the run before launch. */
export function assertFakeClaude(bin: string | undefined): void {
  if (!bin || resolve(bin) !== FAKE_BIN || !existsSync(FAKE_BIN)) {
    throw new Error(`e2e refuses to run: CC_CLAUDE_BIN must be ${FAKE_BIN}, got ${bin || '(unset)'}`)
  }
}
