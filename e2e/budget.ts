export const MAX_SCENARIOS = 20
export const MAX_SUITE_SECONDS = 100

/** UI scenarios in a spec file: each `test(...)` call, `test.only`/`skip`/`fixme` too, but not `test.step`, `test.use` or `test.describe`. */
export function countScenarios(source: string): number {
  return source.match(/(?<![\w.])test(?:\.(?:only|skip|fixme))?\(\s*['"`]/g)?.length ?? 0
}

interface ReportTest {
  results: { status: string; duration: number }[]
}
interface ReportSpec {
  file?: string
  line?: number
  title?: string
  tests: ReportTest[]
}
interface ReportSuite {
  specs?: ReportSpec[]
  suites?: ReportSuite[]
}
export interface JsonReport {
  stats: { duration: number; unexpected: number }
  suites: ReportSuite[]
}

function specsOf(suites: ReportSuite[]): ReportSpec[] {
  return suites.flatMap((s) => [...(s.specs ?? []), ...specsOf(s.suites ?? [])])
}

function testsOf(suites: ReportSuite[]): ReportTest[] {
  return specsOf(suites).flatMap((spec) => spec.tests)
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

export interface TestTime {
  where: string
  title: string
  seconds: number
}

function timesOf(report: JsonReport): TestTime[] {
  return specsOf(report.suites).map((spec) => ({
    where: `${spec.file ?? '?'}:${spec.line ?? '?'}`,
    title: spec.title ?? '',
    seconds: Math.round(spec.tests.flatMap((t) => t.results).reduce((sum, r) => sum + r.duration, 0) / 100) / 10
  }))
}

/** Each test's time in the first run, or in the `--last-failed` rerun for those it ran again; slowest first. */
export function testTimes(first: JsonReport, rerun?: JsonReport): TestTime[] {
  const again = new Map(rerun ? timesOf(rerun).map((t) => [`${t.where} ${t.title}`, t]) : [])
  return timesOf(first)
    .map((t) => again.get(`${t.where} ${t.title}`) ?? t)
    .sort((a, b) => b.seconds - a.seconds)
}

const TITLE_WIDTH = 52

export function timeReport(times: TestTime[], seconds: number, budget: number): string[] {
  const whereWidth = Math.max(0, ...times.map((t) => t.where.length))
  const lines = times.map((t) => {
    const title = t.title.length > TITLE_WIDTH ? `${t.title.slice(0, TITLE_WIDTH)}…` : t.title
    return `${t.seconds.toFixed(1).padStart(6)} s  ${t.where.padEnd(whereWidth)}  ${title}`
  })
  const headroom = Math.round((budget - seconds) * 10) / 10
  return [...lines, `suite ${seconds} s of ${budget} s budget (${Math.abs(headroom)} s ${headroom < 0 ? 'over' : 'left'})`]
}
