import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { MAX_SCENARIOS, countScenarios, suiteSeconds, testTimes, timeReport, type JsonReport } from './budget'

const RULE = 'see "Keep the suites lean" in .scratch/overnight/agent-brief.md: extend an existing scenario or prefer a unit test'

describe('UI suite budget', () => {
  it(`has at most ${MAX_SCENARIOS} scenarios in e2e/*.spec.ts`, () => {
    const specs = readdirSync(__dirname).filter((f) => f.endsWith('.spec.ts'))
    const perFile = specs.map((f) => `${f}: ${countScenarios(readFileSync(join(__dirname, f), 'utf-8'))}`)
    const total = specs.reduce((sum, f) => sum + countScenarios(readFileSync(join(__dirname, f), 'utf-8')), 0)
    expect(total, `${total} UI scenarios (${perFile.join(', ')}) is over the budget of ${MAX_SCENARIOS}; ${RULE}`).toBeLessThanOrEqual(MAX_SCENARIOS)
  })
})

describe('countScenarios', () => {
  it('counts tests, focused and skipped ones too, and nothing else', () => {
    const source = [
      "test('a', async () => {",
      "  await test.step('s', async () => {})",
      '})',
      "test.describe('group', () => {",
      "  test.use({ script: 'slow' })",
      "  test.beforeEach(async () => {})",
      '  test(`b`, async () => {})',
      '  test.only("c", async () => {})',
      "  test.skip('d', async () => {})",
      "  test.fixme('e', async () => {})",
      '})',
      "const mytest = 1; latest('x'); contest('y')"
    ].join('\n')
    expect(countScenarios(source)).toBe(5)
  })
})

describe('suiteSeconds', () => {
  const report = (duration: number, results: [string, number][]): JsonReport => ({
    stats: { duration, unexpected: results.filter(([s]) => s !== 'passed').length },
    suites: [{ suites: [{ specs: results.map(([status, ms]) => ({ tests: [{ results: [{ status, duration: ms }] }] })) }] }]
  })

  it('is the run total when everything passed', () => {
    expect(suiteSeconds(report(61_234, [['passed', 30_000], ['passed', 31_000]]))).toBe(61.2)
  })

  it('swaps a failed test’s time for the rerun total', () => {
    const first = report(70_000, [['passed', 30_000], ['timedOut', 30_000]])
    expect(suiteSeconds(first, report(5_000, [['passed', 4_000]]))).toBe(45)
  })
})

describe('testTimes', () => {
  const spec = (file: string, line: number, title: string, ...results: [string, number][]) => ({
    file,
    line,
    title,
    tests: [{ results: results.map(([status, duration]) => ({ status, duration })) }]
  })
  const first: JsonReport = {
    stats: { duration: 9_000, unexpected: 1 },
    suites: [
      { specs: [spec('a.spec.ts', 3, 'quick one', ['passed', 1_000])] },
      { suites: [{ specs: [spec('b.spec.ts', 7, 'slow one', ['passed', 5_000]), spec('b.spec.ts', 20, 'flaky', ['failed', 3_000])] }] }
    ]
  }

  it('lists every test slowest first, with file:line', () => {
    expect(testTimes(first)).toEqual([
      { where: 'b.spec.ts:7', title: 'slow one', seconds: 5 },
      { where: 'b.spec.ts:20', title: 'flaky', seconds: 3 },
      { where: 'a.spec.ts:3', title: 'quick one', seconds: 1 }
    ])
  })

  it('takes a rerun test’s time from the rerun', () => {
    const rerun: JsonReport = { stats: { duration: 1_500, unexpected: 0 }, suites: [{ specs: [spec('b.spec.ts', 20, 'flaky', ['passed', 1_500])] }] }
    expect(testTimes(first, rerun).map((t) => t.seconds)).toEqual([5, 1.5, 1])
  })
})

describe('timeReport', () => {
  const times = [
    { where: 'chat.spec.ts:12', title: 'a title long enough that it has to be cut short before the end', seconds: 12.34 },
    { where: 'app.spec.ts:4', title: 'opens', seconds: 2 }
  ]

  it('prints one line per test and the headroom', () => {
    expect(timeReport(times, 61.2, 100)).toEqual([
      '  12.3 s  chat.spec.ts:12  a title long enough that it has to be cut short befo…',
      '   2.0 s  app.spec.ts:4    opens',
      'suite 61.2 s of 100 s budget (38.8 s left)'
    ])
  })

  it('says how far over a run is', () => {
    expect(timeReport([], 104.5, 100)).toEqual(['suite 104.5 s of 100 s budget (4.5 s over)'])
  })
})
