import type { Question, QuestionOption } from '../../../shared/approval'

/** The free-text choice every question offers last, as in the extension. */
export const OTHER = 'Other'

/** How long a single-choice pick shows as chosen before the card moves to the next question (the extension's 300 ms). */
export const ADVANCE_MS = 300

export interface QuestionCardState {
  /** The question on screen. */
  step: number
  /** Picked labels per question text, in pick order. */
  picked: Record<string, string[]>
  /** Typed "Other" text per question text. */
  other: Record<string, string>
}

export function emptyCard(questions: readonly Question[]): QuestionCardState {
  return { step: 0, picked: Object.fromEntries(questions.map((q) => [q.question, []])), other: {} }
}

/** Picks or toggles an option of the question on screen; `advance` says the card should move on after `ADVANCE_MS`. */
export function pickOption(
  card: QuestionCardState,
  questions: readonly Question[],
  label: string
): { card: QuestionCardState; advance: boolean } {
  const question = questions[card.step]
  if (!question) return { card, advance: false }
  const before = card.picked[question.question] ?? []
  const after = question.multiSelect
    ? before.includes(label)
      ? before.filter((l) => l !== label)
      : [...before, label]
    : [label]
  const advance = !question.multiSelect && label !== OTHER && card.step < questions.length - 1
  return { card: { ...card, picked: { ...card.picked, [question.question]: after } }, advance }
}

export function typeOther(card: QuestionCardState, question: string, text: string): QuestionCardState {
  return { ...card, other: { ...card.other, [question]: text } }
}

export function showQuestion(card: QuestionCardState, step: number, questions: readonly Question[]): QuestionCardState {
  return { ...card, step: Math.max(0, Math.min(questions.length - 1, step)) }
}

/** The extension's answers: picked labels joined by ", ", with a typed Other answer in place of "Other", at the end. */
export function cardAnswers(card: QuestionCardState, questions: readonly Question[]): Record<string, string> {
  const answers: Record<string, string> = {}
  for (const q of questions) {
    const picked = card.picked[q.question] ?? []
    if (picked.length === 0) continue
    const typed = card.other[q.question]
    answers[q.question] = picked.includes(OTHER) && typed ? [...picked.filter((l) => l !== OTHER), typed].join(', ') : picked.join(', ')
  }
  return answers
}

export function everyQuestionAnswered(questions: readonly Question[], answers: Record<string, string>): boolean {
  return questions.every((q) => (answers[q.question] ?? '').trim().length > 0)
}

export function previewOf(option: QuestionOption | undefined): string | undefined {
  return option?.preview?.trim() ? option.preview : undefined
}

/** Single-choice questions with any option preview get the side-by-side preview pane. */
export function showsPreviews(question: Question): boolean {
  return !question.multiSelect && question.options.some((o) => previewOf(o) !== undefined)
}

const OPENS_FENCE = /^ {0,3}`{3,}[^`]*$/m

/** A preview as markdown: kept as is when it holds a fence, else fenced as text so it shows monospaced (the extension's `pTn`). */
export function previewMarkdown(preview: string): string {
  const text = preview.replace(/\n+$/, '')
  if (OPENS_FENCE.test(text)) return text
  const fence = '`'.repeat(Math.max(2, ...(text.match(/`+/g) ?? []).map((run) => run.length)) + 1)
  return `${fence}text\n${text}\n${fence}`
}

/** Lines the preview pane keeps room for: the longest preview of the question plus one, at least 3. */
export function previewLines(question: Question): number {
  return Math.max(3, ...question.options.map((o) => (previewOf(o)?.replace(/\n+$/, '').split('\n').length ?? 0) + 1))
}

const ANSWERED_HEADS = ['Your questions have been answered: ', 'The user answered: ']
const ANSWERED_TAILS = [
  '. You can now continue with these answers in mind.',
  '. Read the answers carefully — they may request clarification, changes, or that you not proceed — and follow what they actually say.'
]
const NOT_IN_ANSWERS = [' selected preview:', ' notes: ']

const answersText = (questions: readonly Question[], answers: Record<string, string>): string =>
  questions
    .filter((q) => q.question in answers)
    .map((q) => `"${q.question}"="${answers[q.question]}"`)
    .join(', ')

/** The answers in the CLI's AskUserQuestion result (the extension's `rTn`); null when the text is anything else. */
export function answersFromResult(questions: readonly Question[], text: string): Record<string, string> | null {
  const head = ANSWERED_HEADS.find((h) => text.startsWith(h))
  const tail = ANSWERED_TAILS.find((t) => text.endsWith(t))
  if (head === undefined || tail === undefined) return null
  const body = text.slice(head.length, text.length - tail.length)
  const answers: Record<string, string> = {}
  let at = 0
  for (let i = 0; i < questions.length; i++) {
    const key = `"${questions[i].question}"=`
    if (!body.startsWith(key, at)) continue
    const from = at + key.length
    let to = body.length
    for (let j = i + 1; j < questions.length; j++) {
      const next = body.indexOf(`, "${questions[j].question}"=`, from)
      if (next !== -1 && next < to) to = next
    }
    const quoted = body.slice(from, to)
    if (!quoted.startsWith('"') || NOT_IN_ANSWERS.some((n) => quoted.includes('"' + n))) return null
    const close = quoted.lastIndexOf('"')
    if (close > 1) answers[questions[i].question] = quoted.slice(1, close)
    at = to + 2
  }
  if (Object.keys(answers).length === 0) return null
  return answersText(questions, answers) === body ? answers : null
}

export interface AnsweredQuestion {
  picked: string[]
  /** Text typed for Other. */
  other: string | null
}

/** Which options an answer names, and any typed rest (the extension's `lTn`). */
export function answeredView(question: Question, answer: string): AnsweredQuestion {
  const labels = [...question.options.map((o) => o.label), OTHER]
  if (!question.multiSelect) return labels.includes(answer) ? { picked: [answer], other: null } : { picked: [], other: answer }
  const picked: string[] = []
  let rest = answer
  for (;;) {
    const label = labels
      .filter((l) => rest === l || rest.startsWith(l + ', '))
      .sort((a, b) => b.length - a.length)[0]
    if (label === undefined) break
    picked.push(label)
    rest = rest.slice(label.length)
    if (rest === '') return { picked, other: null }
    rest = rest.slice(2)
  }
  return { picked, other: rest }
}

export type QuestionOutcome = { status: 'Answered'; answers: Record<string, string> } | { status: 'Declined' | 'No answer' }

const DECLINED = "The user doesn't want to proceed with this tool use."
const INTERRUPTED_TOOL = '[Request interrupted by user for tool use]'
const NOT_ANSWERED = 'The user did not answer the questions.'

/** How a finished AskUserQuestion call ended, worded as the extension's status line; null for any other result. */
export function questionOutcome(questions: readonly Question[], text: string, isError: boolean): QuestionOutcome | null {
  if (isError) {
    if (text.startsWith(DECLINED)) return { status: 'Declined' }
    return text.startsWith(INTERRUPTED_TOOL) ? { status: 'No answer' } : null
  }
  if (text === NOT_ANSWERED) return { status: 'No answer' }
  const answers = answersFromResult(questions, text)
  return answers ? { status: 'Answered', answers } : null
}
