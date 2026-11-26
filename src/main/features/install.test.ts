import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { runInstall } from './install'

let dir: string
beforeEach(() => void (dir = mkdtempSync(join(tmpdir(), 'cc-install-'))))
afterEach(() => rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 }))

const node = (code: string): string => `node -e "${code}"`

describe('runInstall', () => {
  it('runs the command in the given folder', async () => {
    await runInstall(dir, node("require('fs').writeFileSync('ran.txt','yes')"))
    expect(readFileSync(join(dir, 'ran.txt'), 'utf-8')).toBe('yes')
  })

  it('rejects with the exit code and the command output when it fails', async () => {
    await expect(runInstall(dir, node("console.error('registry down');process.exit(3)"))).rejects.toThrow(/exit 3.*registry down/)
  })

  it('rejects, stopping the command, when it runs too long', async () => {
    await expect(runInstall(dir, node('setTimeout(()=>{},60000)'), 300)).rejects.toThrow(/took longer/)
  })
})
