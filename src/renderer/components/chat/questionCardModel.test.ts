import { describe, expect, it } from 'vitest'
import type { Question } from '../../../shared/approval'
import { answeredView, answersFromResult, questionOutcome, cardAnswers, emptyCard, everyQuestionAnswered, pickOption, previewMarkdown, previewLines, showsPreviews, typeOther } from './questionCardModel'

const db: Question = { question: 'Which database?', header: 'DB', multiSelect: false, options: [{ label: 'Postgres' }, { label: 'SQLite' }] }
const features: Question = { question: 'Which features?', header: 'Features', multiSelect: true, options: [{ label: 'Auth' }, { label: 'Search' }] }
const both = [db, features]

describe('question card', () => {
  it('a single-choice pick replaces the earlier one and moves on to the next question after a moment', () => {
    const first = pickOption(emptyCard(both), both, 'Postgres')
    expect(first.advance).toBe(true)
    const second = pickOption(first.card, both, 'SQLite')
    expect(cardAnswers(second.card, both)).toEqual({ 'Which database?': 'SQLite' })
  })

  it('the last question and Other never move on by themselves', () => {
    expect(pickOption(emptyCard([db]), [db], 'Postgres').advance).toBe(false)
    expect(pickOption(emptyCard(both), both, 'Other').advance).toBe(false)
  })

  it('multi-select toggles, answers in pick order joined by commas, and never moves on', () => {
    const at = { ...emptyCard(both), step: 1 }
    const a = pickOption(at, both, 'Search')
    const b = pickOption(a.card, both, 'Auth')
    expect(b.advance).toBe(false)
    expect(cardAnswers(b.card, both)).toEqual({ 'Which features?': 'Search, Auth' })
    expect(cardAnswers(pickOption(b.card, both, 'Search').card, both)).toEqual({ 'Which features?': 'Auth' })
  })

  it('Other answers with the typed text, after any other picks; untyped it answers "Other"', () => {
    const at = { ...emptyCard(both), step: 1 }
    const picked = pickOption(pickOption(at, both, 'Other').card, both, 'Auth').card
    expect(cardAnswers(picked, both)).toEqual({ 'Which features?': 'Other, Auth' })
    expect(cardAnswers(typeOther(picked, 'Which features?', 'Billing'), both)).toEqual({ 'Which features?': 'Auth, Billing' })
  })

  it('can submit only once every question has an answer', () => {
    const one = pickOption(emptyCard(both), both, 'Postgres').card
    expect(everyQuestionAnswered(both, cardAnswers(one, both))).toBe(false)
    const two = pickOption({ ...one, step: 1 }, both, 'Auth').card
    expect(everyQuestionAnswered(both, cardAnswers(two, both))).toBe(true)
  })
})

describe('question previews', () => {
  const layout: Question = {
    question: 'Which layout?',
    multiSelect: false,
    options: [{ label: 'Grid', preview: '+--+--+\n|  |  |\n+--+--+\n' }, { label: 'List' }]
  }

  it('show beside a single-choice question that has any, never beside a multi-select one', () => {
    expect(showsPreviews(layout)).toBe(true)
    expect(showsPreviews({ ...layout, multiSelect: true })).toBe(false)
    expect(showsPreviews(db)).toBe(false)
  })

  it('are fenced as text so they read monospaced, unless they bring their own fence', () => {
    expect(previewMarkdown('a `b` ```c\n')).toBe('````text\na `b` ```c\n````')
    expect(previewMarkdown('```ts\nconst a = 1\n```')).toBe('```ts\nconst a = 1\n```')
  })

  it('keep room for the longest preview plus one line, at least three', () => {
    expect(previewLines(layout)).toBe(4)
    expect(previewLines(db)).toBe(3)
  })
})

describe('an answered question in the transcript', () => {
  const text = 'Your questions have been answered: "Which database?"="SQLite", "Which features?"="Auth, Billing". You can now continue with these answers in mind.'

  it('reads the answers from the CLI’s result text', () => {
    expect(answersFromResult(both, text)).toEqual({ 'Which database?': 'SQLite', 'Which features?': 'Auth, Billing' })
    expect(answersFromResult(both, 'The user did not answer the questions.')).toBeNull()
  })

  it('splits a multi-select answer into its picked options and the typed rest', () => {
    expect(answeredView(features, 'Auth, Billing')).toEqual({ picked: ['Auth'], other: 'Billing' })
    expect(answeredView(features, 'Auth, Search')).toEqual({ picked: ['Auth', 'Search'], other: null })
    expect(answeredView(db, 'SQLite')).toEqual({ picked: ['SQLite'], other: null })
    expect(answeredView(db, 'MongoDB')).toEqual({ picked: [], other: 'MongoDB' })
  })

  it('words the outcome as the extension: Answered, Declined or No answer', () => {
    expect(questionOutcome(both, text, false)).toEqual({ status: 'Answered', answers: { 'Which database?': 'SQLite', 'Which features?': 'Auth, Billing' } })
    expect(questionOutcome(both, "The user doesn't want to proceed with this tool use. The tool use was rejected.", true)).toEqual({ status: 'Declined' })
    expect(questionOutcome(both, '[Request interrupted by user for tool use]', true)).toEqual({ status: 'No answer' })
    expect(questionOutcome(both, 'The user did not answer the questions.', false)).toEqual({ status: 'No answer' })
    expect(questionOutcome(both, 'something else', false)).toBeNull()
  })
})
