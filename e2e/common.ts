import type { ElectronApplication } from '@playwright/test'
import { evaluateMain, type FakeLog } from './harness'

export const BASIC_REPLY = 'Hello! This is a scripted reply from the fake Claude.'
export const WRITE_DONE = 'Created hello.txt containing hi.'
export const FAKE_SESSION = /^https:\/\/claude\.ai\/code\/session_01Fake[0-9a-f]+$/
export const TINY_PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='

/** Lists VS Code's sessions every 500 ms instead of every 10 s, so a transcript written mid-test shows quickly. */
export const FAST_OBSERVED = { CC_OBSERVED_REFRESH_MS: '500' }

/** The user lines the app sent to the fake. */
export const userLines = (log: FakeLog) => log.entries().filter((e) => e.kind === 'received' && e.line?.type === 'user')

/** The system clipboard, with Windows line ends turned back into the plain newlines the app copied. */
export async function clipboardText(app: ElectronApplication): Promise<string> {
  return (await evaluateMain(app, ({ clipboard }) => clipboard.readText(), undefined)).replace(/\r\n/g, '\n')
}
