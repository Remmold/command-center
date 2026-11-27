import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'

const ROOT = join(__dirname, '..', '..')
const SCANNED_DIRS = ['src', 'tools', 'e2e']
const SKIPPED = ['src/main/util/testGit.ts', 'src/checks/testsIsolateGit.test.ts']
const RAW_GIT = /\b(?:execFileSync|execFile|spawnSync|spawn)\(\s*['"`]git['"`]|\bexecSync\(\s*['"`]git\b/

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    if (name === 'node_modules') return []
    const path = join(dir, name)
    if (statSync(path).isDirectory()) return walk(path)
    return name.endsWith('.test.ts') ? [path] : []
  })
}

const testFiles = (): { file: string; text: string }[] =>
  SCANNED_DIRS.flatMap((d) => walk(join(ROOT, d)))
    .map((path) => ({ file: relative(ROOT, path).split('\\').join('/'), text: readFileSync(path, 'utf8') }))
    .filter(({ file }) => !SKIPPED.includes(file))

// The pre-commit hook exports GIT_DIR and GIT_INDEX_FILE; a test git call that inherits them commits into the real repo.
describe('tests that use git', () => {
  it('spawn git only through the testGit helper', () => {
    expect(testFiles().filter(({ text }) => RAW_GIT.test(text)).map(({ file }) => file)).toEqual([])
  })

  it('strip the GIT_* variables for the code under test too', () => {
    const missing = testFiles().filter(({ text }) => text.includes('util/testGit') && !/\bisolateGitEnv\(\)/.test(text))
    expect(missing.map(({ file }) => file)).toEqual([])
  })
})
