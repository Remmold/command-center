/** A feature's test steps: the checklist a session writes, and the marks kept beside it. */

export type Mark = 'pass' | 'fail'

export interface TestStep {
  text: string
  /** Keys the step's mark, so a rewritten checklist keeps the mark of every step whose text is unchanged. */
  hash: string
}

export interface StepMark {
  mark: Mark
  /** One line; only a Fail keeps one. */
  note: string
}

export type StepMarks = Readonly<Record<string, StepMark>>

export interface ChecklistProblem {
  line: number
  reason: string
}

export interface ParsedChecklist {
  steps: TestStep[]
  problems: ChecklistProblem[]
  /** The path named by the header line, or null when the checklist has none. */
  resultsPath: string | null
}

export interface StepCounter {
  pass: number
  fail: number
  waiting: number
}

const HEADER = /^Test results:\s*(.+?)\s*$/
const HEADER_SCAN_LINES = 10
const STEP = /^\s*-\s\[ \](?:\s+(.*))?$/
const LOOKS_LIKE_STEP = /^\s*[-*+]\s*\[/
const BAD_STEP = 'a step starts with "- [ ] " and then its text'

const normalize = (text: string): string => text.trim().replace(/\s+/g, ' ')

/** cyrb53: a small stable hash, 14 hex digits; no crypto so the renderer can use it too. */
export function stepHash(text: string): string {
  let h1 = 0xdeadbeef
  let h2 = 0x41c6ce57
  for (const ch of normalize(text)) {
    const code = ch.codePointAt(0) ?? 0
    h1 = Math.imul(h1 ^ code, 2654435761)
    h2 = Math.imul(h2 ^ code, 1597334677)
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909)
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909)
  return (4294967296 * (h2 & 2097151) + (h1 >>> 0)).toString(16).padStart(14, '0')
}

/** The header line a checklist carries so the feature session finds the results file. */
export const checklistHeader = (resultsPath: string): string => `Test results: ${resultsPath}`

export function parseChecklist(text: string): ParsedChecklist {
  const lines = text.split(/\r?\n/)
  const steps: TestStep[] = []
  const problems: ChecklistProblem[] = []
  const seen = new Set<string>()
  let resultsPath: string | null = null
  lines.forEach((line, i) => {
    if (i < HEADER_SCAN_LINES && resultsPath === null) resultsPath = HEADER.exec(line)?.[1] ?? null
    const step = STEP.exec(line)
    if (!step) {
      if (LOOKS_LIKE_STEP.test(line)) problems.push({ line: i + 1, reason: BAD_STEP })
      return
    }
    const stepText = normalize(step[1] ?? '')
    if (!stepText) return void problems.push({ line: i + 1, reason: 'a step has no text' })
    const hash = stepHash(stepText)
    if (seen.has(hash)) return void problems.push({ line: i + 1, reason: 'the same step already appears above' })
    seen.add(hash)
    steps.push({ text: stepText, hash })
  })
  return { steps, problems, resultsPath }
}

/** The results file that sits beside a checklist: `<name>.md` gives `<name>.results.txt`. */
export const resultsPathFor = (checklistPath: string): string => checklistPath.replace(/\.md$/i, '') + '.results.txt'

/** Sets or, with `mark` null, clears one step's mark; a note is kept only on a Fail. */
export function markStep(marks: StepMarks, hash: string, mark: Mark | null, note = ''): StepMarks {
  const { [hash]: _gone, ...rest } = marks
  if (!mark) return rest
  return { ...rest, [hash]: { mark, note: mark === 'fail' ? normalize(note) : '' } }
}

export function countSteps(steps: readonly TestStep[], marks: StepMarks): StepCounter {
  const counter: StepCounter = { pass: 0, fail: 0, waiting: 0 }
  for (const step of steps) {
    const mark = marks[step.hash]?.mark
    if (mark === 'pass') counter.pass++
    else if (mark === 'fail') counter.fail++
    else counter.waiting++
  }
  return counter
}

/** The feature row's last test result; empty when the checklist has no steps. */
export function lastResultNote({ pass, fail, waiting }: StepCounter): string {
  if (fail > 0) return `${fail} failed`
  if (waiting > 0) return `${waiting} waiting`
  return pass > 0 ? 'all Pass' : ''
}

/** The results file's text: every current step with its status, so the session reads it as is. Marks of steps no longer in the checklist are not written. */
export function formatResults(feature: string, steps: readonly TestStep[], marks: StepMarks): string {
  const lines = [
    `Test results for ${feature}, kept by Command Center beside the checklist.`,
    'One line per step: PASS, FAIL or WAITING, the step id, the step. A Fail may have a note on the next line.'
  ]
  for (const step of steps) {
    const found = marks[step.hash]
    lines.push(`${found ? found.mark.toUpperCase() : 'WAITING'} ${step.hash} ${step.text}`)
    if (found?.note) lines.push(`  note: ${found.note}`)
  }
  return lines.join('\n') + '\n'
}

export function parseResults(text: string): StepMarks {
  const marks: Record<string, StepMark> = {}
  let last: string | null = null
  for (const line of text.split(/\r?\n/)) {
    const entry = /^(PASS|FAIL) ([0-9a-f]{14}) /.exec(line)
    if (entry) {
      last = entry[2]
      marks[last] = { mark: entry[1] === 'PASS' ? 'pass' : 'fail', note: '' }
      continue
    }
    const note = /^ {2}note: (.*)$/.exec(line)
    if (note && last && marks[last]?.mark === 'fail') marks[last] = { mark: 'fail', note: note[1].trim() }
    else last = /^WAITING /.test(line) ? null : last
  }
  return marks
}

export interface StepView extends TestStep {
  mark: Mark | null
  note: string
}

/** What the test flow window shows for a feature's checklist. */
export type StepsView =
  | { found: false }
  | { found: true; name: string; steps: StepView[]; problems: ChecklistProblem[]; counter: StepCounter }

/** The checklist with each step's mark from the results file text (null when there is no file). */
export function buildStepsView(name: string, checklistText: string, resultsText: string | null): StepsView {
  const { steps, problems } = parseChecklist(checklistText)
  const marks = resultsText === null ? {} : parseResults(resultsText)
  return {
    found: true,
    name,
    steps: steps.map((s) => ({ ...s, mark: marks[s.hash]?.mark ?? null, note: marks[s.hash]?.note ?? '' })),
    problems,
    counter: countSteps(steps, marks)
  }
}
