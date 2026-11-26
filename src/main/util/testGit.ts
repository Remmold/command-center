import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { vi } from 'vitest'

/** The pre-commit hook exports GIT_DIR and friends; inherited, they point a temp repo's git at the real repo. */
export function envWithoutGit(env: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  return Object.fromEntries(Object.entries(env).filter(([key]) => !key.startsWith('GIT_')))
}

/** Strips the GIT_* variables from this test file's process, for code under test that spawns git itself. */
export function isolateGitEnv(): void {
  for (const key of Object.keys(process.env)) if (key.startsWith('GIT_')) vi.stubEnv(key, undefined as never)
}

/** Runs git in `cwd` with no GIT_* variables and a fixed identity; returns stdout. */
export function git(cwd: string, ...args: string[]): string {
  return execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', '-c', 'core.autocrlf=false', ...args], {
    cwd,
    encoding: 'utf-8',
    env: envWithoutGit(),
    stdio: ['ignore', 'pipe', 'pipe']
  })
}

/** Makes `<parent>/<name>` (parent defaults to a fresh temp dir) as a repo on `main` with one commit. */
export function makeTempRepo(parent: string = mkdtempSync(join(tmpdir(), 'cc-git-')), name = 'repo'): string {
  const repo = join(parent, name)
  mkdirSync(repo, { recursive: true })
  git(repo, 'init', '-q', '-b', 'main')
  writeFileSync(join(repo, 'a.txt'), 'a')
  git(repo, 'add', '.')
  git(repo, 'commit', '-q', '-m', 'first')
  return repo
}
