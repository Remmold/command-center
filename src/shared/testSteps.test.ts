import { describe, expect, it } from 'vitest'
import {
  checklistHeader,
  countSteps,
  formatResults,
  lastResultNote,
  markStep,
  parseChecklist,
  parseResults,
  resultsPathFor,
  stepHash
} from './testSteps'

const checklist = (...lines: string[]): string => lines.join('\n')

describe('parseChecklist', () => {
  it('reads one step per "- [ ]" line and ignores prose', () => {
    const read = parseChecklist(checklist('# Login', '', 'Go to the page.', '- [ ] Open /login', '- [ ] Sign in as admin'))
    expect(read.steps.map((s) => s.text)).toEqual(['Open /login', 'Sign in as admin'])
    expect(read.problems).toEqual([])
  })

  it('ignores a malformed step line and says why', () => {
    const read = parseChecklist(checklist('- [ ] Fine', '-[ ] no space', '- [] empty box', '- [ ]   ', '- [ ] Fine'))
    expect(read.steps.map((s) => s.text)).toEqual(['Fine'])
    expect(read.problems).toEqual([
      { line: 2, reason: 'a step starts with "- [ ] " and then its text' },
      { line: 3, reason: 'a step starts with "- [ ] " and then its text' },
      { line: 4, reason: 'a step has no text' },
      { line: 5, reason: 'the same step already appears above' }
    ])
  })

  it('reads the results path from the header line', () => {
    const header = checklistHeader(String.raw`C:\flows\app\x.results.txt`)
    expect(parseChecklist(checklist(header, '- [ ] a')).resultsPath).toBe(String.raw`C:\flows\app\x.results.txt`)
    expect(parseChecklist('- [ ] a').resultsPath).toBeNull()
  })

  it('reads CRLF files', () => {
    expect(parseChecklist('- [ ] a\r\n- [ ] b\r\n').steps.map((s) => s.text)).toEqual(['a', 'b'])
  })
})

describe('stepHash', () => {
  it('is stable, ignores spacing, and differs for different text', () => {
    expect(stepHash('Open  /login ')).toBe(stepHash('Open /login'))
    expect(stepHash('Open /login')).not.toBe(stepHash('Open /logout'))
    expect(stepHash('Open /login')).toMatch(/^[0-9a-f]{14}$/)
  })
})

describe('marks', () => {
  const v1 = parseChecklist(checklist('- [ ] one', '- [ ] two', '- [ ] three')).steps

  it('counts pass, fail and waiting', () => {
    let marks = markStep({}, v1[0].hash, 'pass')
    marks = markStep(marks, v1[1].hash, 'fail', 'button dead')
    expect(countSteps(v1, marks)).toEqual({ pass: 1, fail: 1, waiting: 1 })
  })

  it('stores the note with the Fail and clears it when the mark is cleared', () => {
    const failed = markStep({}, v1[0].hash, 'fail', ' nothing happens ')
    expect(failed[v1[0].hash]).toEqual({ mark: 'fail', note: 'nothing happens' })
    expect(markStep(failed, v1[0].hash, null)).toEqual({})
    expect(markStep({}, v1[0].hash, 'pass', 'ignored')[v1[0].hash]).toEqual({ mark: 'pass', note: '' })
  })

  it('round trips through the results file', () => {
    const marks = markStep(markStep({}, v1[0].hash, 'pass'), v1[2].hash, 'fail', 'wrong colour')
    const text = formatResults('login', v1, marks)
    expect(text).toContain('FAIL')
    expect(parseResults(text)).toEqual(marks)
  })

  it('keeps the mark of an unchanged step and drops the mark of a changed or removed one', () => {
    const marks = markStep(markStep(markStep({}, v1[0].hash, 'pass'), v1[1].hash, 'pass'), v1[2].hash, 'fail', 'x')
    const v2 = parseChecklist(checklist('- [ ] one', '- [ ] two changed')).steps
    const rewritten = parseResults(formatResults('login', v2, marks))
    expect(rewritten).toEqual({ [v1[0].hash]: { mark: 'pass', note: '' } })
    expect(countSteps(v2, rewritten)).toEqual({ pass: 1, fail: 0, waiting: 1 })
  })

  it('reads a damaged results file as no marks for its bad lines', () => {
    expect(parseResults('garbage\nPASS nothex text\n')).toEqual({})
  })

  it('lists every step with its status so the session can read it', () => {
    const text = formatResults('login', v1, markStep({}, v1[1].hash, 'fail', 'dead'))
    expect(text.split('\n').filter((l) => /^(PASS|FAIL|WAITING) /.test(l))).toHaveLength(3)
    expect(text).toContain('  note: dead')
  })
})

describe('lastResultNote', () => {
  it('names the state in the order failed, waiting, all Pass', () => {
    expect(lastResultNote({ pass: 1, fail: 2, waiting: 1 })).toBe('2 failed')
    expect(lastResultNote({ pass: 1, fail: 0, waiting: 3 })).toBe('3 waiting')
    expect(lastResultNote({ pass: 4, fail: 0, waiting: 0 })).toBe('all Pass')
    expect(lastResultNote({ pass: 0, fail: 0, waiting: 0 })).toBe('')
  })
})

describe('resultsPathFor', () => {
  it('sits beside the checklist with the same name', () => {
    expect(resultsPathFor(String.raw`C:\flows\app\login.md`)).toBe(String.raw`C:\flows\app\login.results.txt`)
    expect(resultsPathFor('/flows/app/login.md')).toBe('/flows/app/login.results.txt')
  })
})
