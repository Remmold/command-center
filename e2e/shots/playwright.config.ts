import { existsSync, readdirSync } from 'node:fs'
import { join, relative, resolve, sep } from 'node:path'
import { defineConfig } from '@playwright/test'

const REPO = resolve(__dirname, '..', '..')

/** CLI options that take the next token as their value (optional and variadic ones included, as commander parses them). */
const WITH_VALUE = new Set(['--add-reporter', '--browser', '-c', '--config', '--debug', '-g', '--grep', '-G', '--grep-invert', '--global-timeout', '-j', '--workers', '--last-failed-file', '--max-failures', '--only-changed', '--output', '--repeat-each', '--reporter', '--retries', '--run-agents', '--shard', '--shuffle', '--test-list', '--test-list-invert', '--timeout', '--trace', '--tsconfig', '-u', '--update-snapshots', '--ui-host', '--ui-port', '--update-source-method'])
const VARIADIC = new Set(['--project'])

type SpecMatcher = (file: string) => boolean

const repoPath = (file: string): string => relative(REPO, file).replace(/\\/g, '/')

/**
 * The positional file filters of `playwright test`, without a `:line:column`: a path that exists matches the files
 * under it, anything else is a regexp (as Playwright builds it) tested on the repo-relative path.
 */
function fileFilters(argv: readonly string[]): SpecMatcher[] {
  const start = argv.indexOf('test')
  if (start < 0) return []
  const filters: SpecMatcher[] = []
  for (let i = start + 1; i < argv.length; i++) {
    const arg = argv[i]
    if (arg.startsWith('-')) {
      if (VARIADIC.has(arg)) while (i + 1 < argv.length && !argv[i + 1].startsWith('-')) i++
      else if (WITH_VALUE.has(arg) && i + 1 < argv.length && !argv[i + 1].startsWith('-')) i++
      continue
    }
    const file = arg.replace(/:\d+(:\d+)?$/, '')
    const re = file.match(/^\/(.*)\/([gi]*)$/)
    if (re) {
      const regexp = new RegExp(re[1], re[2].replace('g', ''))
      filters.push((spec) => regexp.test(repoPath(spec)))
    } else if (existsSync(resolve(file))) {
      const at = resolve(file)
      filters.push((spec) => spec === at || spec.startsWith(at + sep))
    } else {
      const regexp = new RegExp(file.replace(/\\/g, '/'), 'i')
      filters.push((spec) => regexp.test(repoPath(spec)))
    }
  }
  return filters
}

// Playwright matches a positional filter against the absolute path, so a bare `typing` also matches this worktree's
// folder (command-center-typing-lag) and runs every spec. Only the specs a filter matches are collected; when none
// does (an option this file does not know took a value), Playwright's own matching decides, as before.
const filters = fileFilters(process.argv)
const specs = readdirSync(__dirname).filter((name) => name.endsWith('.shots.ts'))
const matching = specs.filter((name) => filters.some((matches) => matches(join(__dirname, name))))

export default defineConfig({
  testDir: '.',
  testMatch: matching.length ? matching : '*.shots.ts',
  timeout: 120_000,
  expect: { timeout: 15_000 },
  workers: 1,
  retries: 0,
  reporter: [['list']],
  outputDir: '../../node_modules/.cache/shots-results'
})
