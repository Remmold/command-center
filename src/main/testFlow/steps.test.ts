import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { stepHash } from '../../shared/testSteps'
import { markStepOnDisk, readSteps } from './steps'

let folder: string
let checklist: string
beforeEach(() => {
  folder = mkdtempSync(join(tmpdir(), 'cc-steps-'))
  mkdirSync(join(folder, 'app'))
  checklist = join(folder, 'app', 'login.md')
  writeFileSync(checklist, '- [ ] one\n- [ ] two\n')
})
afterEach(() => rmSync(folder, { recursive: true, force: true }))

describe('test steps on disk', () => {
  it('shows every step waiting before anything is marked', async () => {
    const view = await readSteps(folder, checklist)
    expect(view).toMatchObject({ found: true, name: 'login', counter: { pass: 0, fail: 0, waiting: 2 } })
  })

  it('saves a mark and a Fail note where the session reads them, and reads them back', async () => {
    await markStepOnDisk(folder, checklist, stepHash('one'), 'pass', '')
    const view = await markStepOnDisk(folder, checklist, stepHash('two'), 'fail', 'dead button')
    expect(view).toMatchObject({ found: true, counter: { pass: 1, fail: 1, waiting: 0 } })
    const text = readFileSync(join(folder, 'app', 'login.results.txt'), 'utf8')
    expect(text).toContain('FAIL')
    expect(text).toContain('note: dead button')
    expect(await readSteps(folder, checklist)).toEqual(view)
  })

  it('keeps marks of unchanged steps when the checklist is rewritten', async () => {
    await markStepOnDisk(folder, checklist, stepHash('one'), 'pass', '')
    writeFileSync(checklist, '- [ ] one\n- [ ] two changed\n')
    expect(await readSteps(folder, checklist)).toMatchObject({ counter: { pass: 1, fail: 0, waiting: 1 } })
  })

  it('refuses a checklist outside the folder and marks of steps that are not there', async () => {
    const outside = join(tmpdir(), 'cc-steps-outside.md')
    expect(await readSteps(folder, outside)).toEqual({ found: false })
    expect(await markStepOnDisk(folder, checklist, 'ffffffffffffff', 'pass', '')).toMatchObject({ counter: { pass: 0, waiting: 2 } })
  })

  it('does not find a missing checklist', async () => {
    expect(await readSteps(folder, join(folder, 'app', 'none.md'))).toEqual({ found: false })
  })
})
