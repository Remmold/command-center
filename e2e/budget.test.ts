import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { MAX_SCENARIOS, countScenarios, suiteSeconds, type JsonReport } from './budget'

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
