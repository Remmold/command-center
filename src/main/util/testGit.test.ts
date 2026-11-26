import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { git, isolateGitEnv, makeTempRepo } from './testGit'

describe('temp git helper', () => {
  afterEach(() => vi.unstubAllEnvs())

  it('ignores GIT_DIR and GIT_INDEX_FILE set in the environment and leaves the real repo untouched', () => {
    const before = execHead()
    const bogus = join(tmpdir(), 'no-such-git-dir')
    vi.stubEnv('GIT_DIR', bogus)
    vi.stubEnv('GIT_INDEX_FILE', join(bogus, 'index'))
    const root = mkdtempSync(join(tmpdir(), 'cc-testgit-'))
    try {
      const repo = makeTempRepo(root)
      expect(git(repo, 'log', '--format=%s').trim()).toBe('first')
      expect(git(repo, 'rev-parse', '--show-toplevel').trim().toLowerCase()).toBe(repo.split(String.fromCharCode(92)).join('/').toLowerCase())
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
    vi.unstubAllEnvs()
    expect(execHead()).toBe(before)
  })

  it('isolateGitEnv removes GIT_* from the process environment for code that spawns git itself', () => {
    vi.stubEnv('GIT_DIR', 'x')
    isolateGitEnv()
    expect(process.env.GIT_DIR).toBeUndefined()
  })
})

function execHead(): string {
  return git(process.cwd(), 'rev-parse', 'HEAD').trim()
}
