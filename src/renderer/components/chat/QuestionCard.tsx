import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { denyReply, parseQuestions, questionReply, type ApprovalReply, type ApprovalRequest, type Question } from '../../../shared/approval'
import { ChoiceButton, ChoiceField, ChoiceList, ChoicePrompt, OptionRow, focusFirstAnswer, mayTakeFocus, optionRows, PreviewPane, PromptHeading, PromptNote, StepTabs, WithPreview } from '../ui/ChoicePrompt'
import { Markdown } from '../ui/Markdown'
import { isTyping } from '../ui/overlay'
import {
  ADVANCE_MS,
  OTHER,
  answeredView,
  cardAnswers,
  emptyCard,
  everyQuestionAnswered,
  pickOption,
  previewLines,
  previewMarkdown,
  previewOf,
  showQuestion,
  showsPreviews,
  typeOther
} from './questionCardModel'

/** The extension waits this long on a hovered option before its preview replaces the highlighted one. */
const HOVER_PREVIEW_MS = 150


const stepLabel = (q: Question, i: number): string => q.header || `Question ${i + 1}`


interface Props {
  request: ApprovalRequest
  /** The approval prompt's own reply, so an answer from here goes where every other answer goes. */
  onReply: (reply: ApprovalReply) => void
  hint: string
}

/** An AskUserQuestion request as the extension's card: one tab per question, options to click, Other to type, Submit answers. */
export function QuestionPrompt({ request, onReply, hint }: Props) {
  const questions = useMemo(() => parseQuestions(request.input), [request.input])
  const [card, setCard] = useState(() => emptyCard(questions))
  const [confirming, setConfirming] = useState<string | null>(null)
  const [highlight, setHighlight] = useState<{ step: number; row: number } | null>(null)
  const rootRef = useRef<HTMLDivElement | null>(null)
  const otherRef = useRef<HTMLInputElement | null>(null)
  const submitRef = useRef<HTMLButtonElement | null>(null)
  const advanceTimer = useRef<ReturnType<typeof setTimeout>>()
  const hoverTimer = useRef<ReturnType<typeof setTimeout>>()
  const previewId = useId()

  useEffect(
    () => () => {
      clearTimeout(advanceTimer.current)
      clearTimeout(hoverTimer.current)
    },
    []
  )

  useEffect(() => {
    if (mayTakeFocus(rootRef.current)) focusFirstAnswer(rootRef.current)
  }, [])

  // The option that had focus belonged to the question before, so focus may have dropped to the body.
  useEffect(() => {
    const active = document.activeElement
    if (!active || active === document.body || (!isTyping(active) && rootRef.current?.contains(active))) focusFirstAnswer(rootRef.current)
  }, [card.step])

  const answers = cardAnswers(card, questions)
  const ready = everyQuestionAnswered(questions, answers)
  const submit = (): void => {
    if (ready) onReply(questionReply(request.input, answers))
  }
  const cancel = (): void => onReply(denyReply(''))
  const goTo = (step: number): void => setCard((c) => showQuestion(c, step, questions))

  const pick = (label: string): void => {
    if (confirming) return
    const next = pickOption(card, questions, label)
    setCard(next.card)
    if (label === OTHER) setTimeout(() => otherRef.current?.focus(), 0)
    if (next.advance) {
      setConfirming(label)
      advanceTimer.current = setTimeout(() => {
        setConfirming(null)
        goTo(card.step + 1)
      }, ADVANCE_MS)
    }
  }

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>): void => {
    if (e.metaKey || e.ctrlKey || e.altKey) return
    if (e.key === 'Escape') {
      e.preventDefault()
      cancel()
      return
    }
    if (isTyping(e.target)) return
    if (e.key === '1' || (e.key === 'Enter' && e.target !== submitRef.current)) {
      e.preventDefault()
      submit()
    } else if (e.key === 'ArrowLeft' && card.step > 0) {
      e.preventDefault()
      goTo(card.step - 1)
    } else if (e.key === 'ArrowRight' && card.step < questions.length - 1) {
      e.preventDefault()
      goTo(card.step + 1)
    } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      const options = optionRows(rootRef.current)
      if (options.length === 0) return
      e.preventDefault()
      const at = options.findIndex((o) => o === document.activeElement)
      const next = e.key === 'ArrowUp' ? (at <= 0 ? options.length - 1 : at - 1) : at >= options.length - 1 ? 0 : at + 1
      options[next].focus()
    }
  }

  const onOtherKey = (e: KeyboardEvent<HTMLInputElement>): void => {
    if (!e.metaKey && !e.ctrlKey && e.key !== 'Escape') e.stopPropagation()
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault()
      if (card.step < questions.length - 1) goTo(card.step + 1)
    }
  }

  const question = questions[card.step]
  if (!question) {
    return (
      <ChoicePrompt ref={rootRef} label="Questions from Claude" hint={hint} onKeyDown={onKeyDown}>
        <PromptHeading>No questions provided</PromptHeading>
      </ChoicePrompt>
    )
  }

  const picked = card.picked[question.question] ?? []
  const previews = showsPreviews(question)
  const row = previews ? (highlight?.step === card.step ? highlight.row : 0) : -1
  const rowLabel = row === question.options.length ? OTHER : question.options[row]?.label
  const preview = previewOf(question.options[row])
  const highlightRow = (r: number) => (previews ? () => (clearTimeout(hoverTimer.current), setHighlight({ step: card.step, row: r })) : undefined)
  const hoverRow = (r: number) =>
    previews
      ? () => {
          clearTimeout(hoverTimer.current)
          hoverTimer.current = setTimeout(() => setHighlight({ step: card.step, row: r }), HOVER_PREVIEW_MS)
        }
      : undefined
  const endHover = previews ? () => clearTimeout(hoverTimer.current) : undefined
  const optionProps = (label: string, r: number) => ({
    multiSelect: question.multiSelect,
    selected: picked.includes(label),
    confirming: confirming === label,
    highlighted: row === r,
    describedBy: row === r ? previewId : undefined,
    onSelect: () => pick(label),
    onHighlight: highlightRow(r),
    onHover: hoverRow(r),
    onHoverEnd: endHover
  })

  return (
    <ChoicePrompt ref={rootRef} label="Questions from Claude" hint={hint} onKeyDown={onKeyDown}>
      <StepTabs
        steps={questions.map((q, i) => ({ label: stepLabel(q, i), done: (card.picked[q.question]?.length ?? 0) > 0 }))}
        current={card.step}
        onPick={goTo}
        onClose={cancel}
        closeLabel="Cancel"
      />
      <PromptHeading>{question.question}</PromptHeading>
      <WithPreview
        list={
          <ChoiceList>
            {question.options.map((option, r) => (
              <OptionRow key={`${card.step}-${r}`} label={option.label} description={option.description} {...optionProps(option.label, r)} />
            ))}
            <OptionRow key={`${card.step}-other`} label={OTHER} {...optionProps(OTHER, question.options.length)}>
              {picked.includes(OTHER) && (
                <span onClick={(e) => e.stopPropagation()}>
                  <ChoiceField
                    ref={otherRef}
                    placeholder="Type your answer…"
                    value={card.other[question.question] ?? ''}
                    onChange={(text) => setCard((c) => typeOther(c, question.question, text))}
                    onKeyDown={onOtherKey}
                  />
                </span>
              )}
            </OptionRow>
          </ChoiceList>
        }
        preview={
          row === -1 ? null : (
            <PreviewPane id={previewId} caption={rowLabel ?? ''} lines={previewLines(question)}>
              {preview === undefined ? <PromptNote>No preview for this option</PromptNote> : <Markdown text={previewMarkdown(preview)} />}
            </PreviewPane>
          )
        }
      />
      <ChoiceList>
        <ChoiceButton ref={submitRef} shortcut="1" primary disabled={!ready} onClick={submit}>
          Submit answers
        </ChoiceButton>
      </ChoiceList>
    </ChoicePrompt>
  )
}

/** Answered questions in a transcript, read-only: the picked options marked, the rest faded, a typed answer under Other. */
export function AnsweredQuestions({ questions, answers }: { questions: readonly Question[]; answers: Record<string, string> }) {
  return (
    <div className="flex flex-col gap-3 py-1">
      {questions.map((q, i) => {
        const answer = answers[q.question]
        const { picked, other } = answer === undefined ? { picked: [], other: null } : answeredView(q, answer)
        const anything = picked.length > 0 || other !== null
        return (
          <div key={i} className="flex flex-col gap-1.5">
            <PromptHeading>{q.question}</PromptHeading>
            <ChoiceList>
              {q.options.map((o, r) => (
                <OptionRow key={r} multiSelect={q.multiSelect} label={o.label} description={o.description} selected={picked.includes(o.label)} dimmed={anything && !picked.includes(o.label)} />
              ))}
              {(other !== null || picked.includes(OTHER)) && (
                <OptionRow multiSelect={q.multiSelect} label={OTHER} selected>
                  {other !== null && <PromptNote>{other}</PromptNote>}
                </OptionRow>
              )}
            </ChoiceList>
          </div>
        )
      })}
    </div>
  )
}
