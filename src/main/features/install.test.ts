import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { killRunningInstalls, runInstall } from './install'

let dir: string
beforeEach(() => void (dir = mkdtempSync(join(tmpdir(), 'cc-install-'))))
afterEach(() => rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 }))

const node = (code: string): string => `node -e "${code}"`

describe('runInstall', () => {
  it('runs the command in the given folder', async () => {
    await runInstall(dir, node("require('fs').writeFileSync('ran.txt','yes')"))
    expect(readFileSync(join(dir, 'ran.txt'), 'utf-8')).toBe('yes')
  })

  it('runs on the given account environment, not the app environment', async () => {
    await runInstall(dir, node("require('fs').writeFileSync('env.txt',process.env.CLAUDE_CONFIG_DIR||'unset')"), { CLAUDE_CONFIG_DIR: 'C:/acct/work' })
    expect(readFileSync(join(dir, 'env.txt'), 'utf-8')).toBe('C:/acct/work')
  })

  it('rejects with the exit code and the command output when it fails', async () => {
    await expect(runInstall(dir, node("console.error('registry down');process.exit(3)"))).rejects.toThrow(/exit 3.*registry down/)
  })

  it('rejects, stopping the command, when it runs too long', async () => {
    await expect(runInstall(dir, node('setTimeout(()=>{},60000)'), {}, 300)).rejects.toThrow(/took longer/)
  })
})

describe('killRunningInstalls', () => {
  it('stops an install that is still running, as the app quitting does', async () => {
    const running = runInstall(dir, node('setTimeout(()=>{},60000)'))
    const outcome = running.then(() => 'finished', (err: Error) => err.message)
    await new Promise((r) => setTimeout(r, 300))
    killRunningInstalls()
    expect(await outcome).toMatch(/failed|stopped/)
  })

  it('has nothing to stop when no install runs', () => {
    expect(() => killRunningInstalls()).not.toThrow()
  })
})
