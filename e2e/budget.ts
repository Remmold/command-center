export const MAX_SCENARIOS = 20
export const MAX_SUITE_SECONDS = 90

/** UI scenarios in a spec file: each `test(...)` call, `test.only`/`skip`/`fixme` too, but not `test.step`, `test.use` or `test.describe`. */
export function countScenarios(source: string): number {
  return source.match(/(?<![\w.])test(?:\.(?:only|skip|fixme))?\(\s*['"`]/g)?.length ?? 0
}

interface ReportTest {
  results: { status: string; duration: number }[]
}
interface ReportSuite {
  specs?: { tests: ReportTest[] }[]
  suites?: ReportSuite[]
}
export interface JsonReport {
  stats: { duration: number; unexpected: number }
  suites: ReportSuite[]
}

function testsOf(suites: ReportSuite[]): ReportTest[] {
  return suites.flatMap((s) => [...(s.specs ?? []).flatMap((spec) => spec.tests), ...testsOf(s.suites ?? [])])
}

/**
 * The suite's runtime from Playwright's JSON report: the first run's total, with the time of tests that failed
 * there swapped for the `--last-failed` rerun's total.
 */
export function suiteSeconds(first: JsonReport, rerun?: JsonReport): number {
  const failedMs = testsOf(first.suites)
    .map((t) => t.results.at(-1))
    .filter((r) => r && r.status !== 'passed' && r.status !== 'skipped')
    .reduce((sum, r) => sum + (r?.duration ?? 0), 0)
  const ms = rerun ? first.stats.duration - failedMs + rerun.stats.duration : first.stats.duration
  return Math.round(ms / 100) / 10
}
