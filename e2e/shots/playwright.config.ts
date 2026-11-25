import { readdirSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { defineConfig } from '@playwright/test'

const REPO = resolve(__dirname, '..', '..')

/** CLI options that take the next token as their value (optional and variadic ones included, as commander parses them). */
const WITH_VALUE = new Set(['--add-reporter', '--browser', '-c', '--config', '--debug', '-g', '--grep', '-G', '--grep-invert', '--global-timeout', '-j', '--workers', '--last-failed-file', '--max-failures', '--only-changed', '--output', '--repeat-each', '--reporter', '--retries', '--run-agents', '--shard', '--shuffle', '--test-list', '--test-list-invert', '--timeout', '--trace', '--tsconfig', '-u', '--update-snapshots', '--ui-host', '--ui-port', '--update-source-method'])
const VARIADIC = new Set(['--project'])

/** The positional file filters of `playwright test`, as regexps the way Playwright builds them, without a `:line:column`. */
function fileFilters(argv: readonly string[]): RegExp[] {
  const start = argv.indexOf('test')
  if (start < 0) return []
  const filters: RegExp[] = []
  for (let i = start + 1; i < argv.length; i++) {
    const arg = argv[i]
    if (arg.startsWith('-')) {
      if (VARIADIC.has(arg)) while (i + 1 < argv.length && !argv[i + 1].startsWith('-')) i++
      else if (WITH_VALUE.has(arg) && i + 1 < argv.length && !argv[i + 1].startsWith('-')) i++
      continue
    }
    const file = arg.replace(/:\d+(:\d+)?$/, '')
    const re = file.match(/^\/(.*)\/([gi]*)$/)
    filters.push(re ? new RegExp(re[1], re[2].replace('g', '')) : new RegExp(file.replace(/\\/g, '/'), 'i'))
  }
  return filters
}

// Playwright matches a positional filter against the absolute path, so a bare `typing` also matches this worktree's
// folder (command-center-typing-lag) and runs every spec. Only the specs whose repo-relative path matches are collected.
const filters = fileFilters(process.argv)
const specs = readdirSync(__dirname).filter((name) => name.endsWith('.shots.ts'))
const matching = specs.filter((name) => filters.some((re) => re.test(relative(REPO, join(__dirname, name)).replace(/\\/g, '/'))))

export default defineConfig({
  testDir: '.',
  testMatch: filters.length ? (matching.length ? matching : 'no spec matches the filter') : '*.shots.ts',
  timeout: 120_000,
  expect: { timeout: 15_000 },
  workers: 1,
  retries: 0,
  reporter: [['list']],
  outputDir: '../../node_modules/.cache/shots-results'
})
