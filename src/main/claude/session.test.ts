import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { ClaudeSession } from './session'

const FAKE = join(__dirname, '..', '..', '..', 'tools', 'fake-claude', 'fake-claude.mjs')

const SCRIPT = {
  turns: [
    {
      match: '^start',
      events: [
        {
          type: 'tool_use',
          name: 'Bash',
          input: { command: 'pnpm dev', description: 'Start the dev server', run_in_background: true },
          approval: false
        }
      ]
    }
  ]
}

function alive(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

describe.runIf(process.platform === 'win32')('killing a hosted session', () => {
  let dir: string
  let logFile: string
  const saved = { ...process.env }
  const spawned: number[] = []

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'cc-session-kill-'))
    logFile = join(dir, 'fake.log')
    writeFileSync(join(dir, 'script.json'), JSON.stringify(SCRIPT))
    process.env.CC_CLAUDE_BIN = FAKE
    process.env.FAKE_CLAUDE_SCRIPT = join(dir, 'script.json')
    process.env.FAKE_CLAUDE_LOG = logFile
  })

  afterEach(() => {
    process.env = { ...saved }
    for (const pid of spawned.splice(0)) {
      try {
        execFileSync('taskkill', ['/PID', String(pid), '/T', '/F'], { stdio: 'ignore' })
      } catch {
        // Already gone.
      }
    }
    rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 })
  })

  const spawnedPid = (): number | undefined => {
    if (!existsSync(logFile)) return undefined
    const entry = readFileSync(logFile, 'utf-8')
      .split('\n')
      .filter((l) => l.trim())
      .map((l) => JSON.parse(l) as { kind: string; pid?: number })
      .find((e) => e.kind === 'spawned')
    return entry?.pid
  }

  it('ends the background process the CLI started, not only the CLI', async () => {
    const session = new ClaudeSession({ paneId: 'p1', cwd: dir, onEvent: () => {}, onExit: () => {}, onInit: () => {} })
    session.send([{ type: 'text', text: 'start' }], 'u1')
    await expect.poll(spawnedPid, { timeout: 10_000 }).toBeDefined()
    const pid = spawnedPid()!
    spawned.push(pid)
    expect(alive(pid)).toBe(true)

    await session.kill()

    await expect.poll(() => alive(pid), { timeout: 2000 }).toBe(false)
  }, 20_000)
})
