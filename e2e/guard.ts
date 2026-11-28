import { existsSync } from 'node:fs'
import { join, resolve, sep } from 'node:path'

export const FAKE_BIN = join(resolve(__dirname, '..'), 'tools', 'fake-claude', 'fake-claude.mjs')

/**
 * Before 24.16, Node's libuv calls RtlGetVersion with an uninitialised struct size on every loopback connect
 * on Windows, which can overrun the stack and kill the process with 0xC0000409. The Playwright worker connects
 * to each launched app's debug ports, so on those versions a test randomly dies at 0 ms.
 */
export function workerCrashWarning(version: string, platform: string): string | undefined {
  if (platform !== 'win32') return undefined
  const [major, minor] = version.replace(/^v/, '').split('.').map(Number)
  const affected = major < 24 || (major === 24 && minor < 16) || major === 25
  if (!affected) return undefined
  return (
    `Node ${version} on Windows has a libuv bug (nodejs/node#63620) that randomly kills the Playwright worker ` +
    `with code 3221226505 when it connects to the app. Use Node 24.16 or later.`
  )
}

/** The suite must never reach the real CLI: anything but this repo's fake stops the run before launch. */
export function assertFakeClaude(bin: string | undefined): void {
  if (!bin || resolve(bin) !== FAKE_BIN || !existsSync(FAKE_BIN)) {
    throw new Error(`e2e refuses to run: CC_CLAUDE_BIN must be ${FAKE_BIN}, got ${bin || '(unset)'}`)
  }
}

const inside = (root: string, path: string | undefined): boolean => !!path && resolve(path).toLowerCase().startsWith(join(resolve(root), sep).toLowerCase())

/** A real ComfyUI3D run may be live on the machine: the 3D service must only ever see the test's own fakes. */
export function assertFakeModel3d(env: Record<string, string | undefined>, root: string): void {
  const port = Number(env.CC_MODEL3D_PORT)
  const problems = [
    !Number.isInteger(port) || port <= 0 || port === 8189 ? `CC_MODEL3D_PORT is ${env.CC_MODEL3D_PORT ?? '(unset)'}` : null,
    inside(root, env.CC_MODEL3D_ENGINE_DIR) ? null : `CC_MODEL3D_ENGINE_DIR ${env.CC_MODEL3D_ENGINE_DIR ?? '(unset)'} is outside ${root}`,
    inside(root, env.CC_MODEL3D_COORD) ? null : `CC_MODEL3D_COORD ${env.CC_MODEL3D_COORD ?? '(unset)'} is outside ${root}`
  ].filter((p): p is string => p !== null)
  if (problems.length > 0) throw new Error(`e2e refuses to run: ${problems.join('; ')}`)
}
