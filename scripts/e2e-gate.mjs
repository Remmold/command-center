// Run: pnpm e2e:gate. The release gate's UI suite: one build, one run, a `--last-failed` rerun of only what
// failed, then the time budget from Playwright's JSON report. Non-zero on a test still red or a run over budget.
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { MAX_SUITE_SECONDS, suiteSeconds, testTimes, timeReport } from '../e2e/budget.ts'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const out = join(root, 'node_modules', '.cache', 'e2e-gate')
mkdirSync(out, { recursive: true })

const env = { ...process.env }
delete env.ELECTRON_RUN_AS_NODE

// One command string: pnpm is a .cmd on Windows, which needs the shell, and the arguments here are all fixed.
const run = (args, extraEnv = {}) => spawnSync(`pnpm ${args.join(' ')}`, { cwd: root, stdio: 'inherit', shell: true, env: { ...env, ...extraEnv } }).status ?? 1
const playwright = (report, extra) => {
  rmSync(report, { force: true })
  run(['exec', 'playwright', 'test', '-c', 'e2e/playwright.config.ts', '--reporter=json,line', ...extra], { PLAYWRIGHT_JSON_OUTPUT_NAME: report })
  if (!existsSync(report)) {
    console.error('e2e-gate: Playwright wrote no JSON report.')
    process.exit(1)
  }
  return JSON.parse(readFileSync(report, 'utf-8'))
}

if (run(['build']) !== 0) process.exit(1)
const first = playwright(join(out, 'first.json'), [])
let rerun
if (first.stats.unexpected > 0) {
  console.log(`e2e-gate: ${first.stats.unexpected} failed; rerunning only those (--last-failed).`)
  rerun = playwright(join(out, 'rerun.json'), ['--last-failed'])
  if (rerun.stats.unexpected > 0) {
    console.error(`e2e-gate: ${rerun.stats.unexpected} still failing after the rerun.`)
    process.exit(1)
  }
}
const seconds = suiteSeconds(first, rerun)
for (const line of timeReport(testTimes(first, rerun), seconds, MAX_SUITE_SECONDS)) console.log(line)
if (seconds > MAX_SUITE_SECONDS) {
  console.error(`e2e-gate: the UI suite took ${seconds} s, over the ${MAX_SUITE_SECONDS} s budget. See "Keep the suites lean" in .scratch/overnight/agent-brief.md.`)
  process.exit(1)
}
console.log(`e2e-gate: green in ${seconds} s (budget ${MAX_SUITE_SECONDS} s)${rerun ? ', after one rerun of the failed tests' : ''}.`)
