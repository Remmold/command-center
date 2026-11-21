import { spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { ensureHookScriptInstalled } from './hookScript'

const dirs: string[] = []
const tempDir = (): string => {
  const dir = mkdtempSync(join(tmpdir(), 'cc-hook-'))
  dirs.push(dir)
  return dir
}
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true })
})

async function runHook(env: Record<string, string>): Promise<string> {
  const script = join(tempDir(), 'permission-hook.cjs')
  await ensureHookScriptInstalled(script)
  const clean = Object.fromEntries(
    Object.entries(process.env).filter(([k]) => !k.startsWith('CC_'))
  ) as Record<string, string>
  const result = spawnSync(process.execPath, [script], {
    input: JSON.stringify({ tool_name: 'Bash', tool_input: { command: 'rm -rf /' } }),
    env: { ...clean, ELECTRON_RUN_AS_NODE: '1', ...env },
    encoding: 'utf-8'
  })
  expect(result.status).toBe(0)
  return result.stdout
}

async function closedPort(): Promise<number> {
  return new Promise((resolve) => {
    const server = createServer()
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      const port = typeof address === 'object' && address ? address.port : 0
      server.close(() => resolve(port))
    })
  })
}

describe('permission hook script', () => {
  it('makes no decision for a session the app did not start, so Claude prompts as usual', async () => {
    expect(await runHook({})).toBe('')
  })

  it('blocks a hosted session when the app cannot be reached', async () => {
    const out = await runHook({ CC_PERMISSION_PORT: String(await closedPort()), CC_PANE_ID: 'p1' })
    expect(JSON.parse(out)).toMatchObject({ decision: 'block' })
  })
})
