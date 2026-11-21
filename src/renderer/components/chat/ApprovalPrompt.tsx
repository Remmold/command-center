import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import {
  DESTINATION_HINT,
  DESTINATION_LABEL,
  PLAN_TOOL,
  allowReply,
  alwaysAllowLabel,
  alwaysAllowReply,
  denyReply,
  initialDestination,
  nextDestination,
  planDenyReply,
  planManualReply,
  planYes,
  type ApprovalReply,
  type ApprovalRequest,
  type LabelPart,
  type PermissionDestination,
  type ToolInput
} from '../../../shared/approval'
import { useApprovalsStore } from '../../state/approvalsStore'
import type { PermissionMode } from '../../state/permissionModes'
import {
  ChoiceButton,
  ChoiceField,
  ChoiceLink,
  ChoiceList,
  ChoicePrompt,
  PromptCode,
  PromptDetails,
  PromptNote,
  PromptPath
} from '../ui/ChoicePrompt'
import { Markdown } from '../ui/Markdown'

const DESTINATION_KEY = 'command-center.permission-destination'

function rememberedDestination(): string | null {
  try {
    return localStorage.getItem(DESTINATION_KEY)
  } catch {
    return null
  }
}

function rememberDestination(destination: PermissionDestination): void {
  try {
    localStorage.setItem(DESTINATION_KEY, destination)
  } catch {
    return
  }
}

const text = (value: unknown): string => (typeof value === 'string' ? value : '')
const fileName = (input: ToolInput): string => text(input.file_path).split('/').pop() ?? ''

function InputDetails({ input }: { input: ToolInput }) {
  if (Object.keys(input).length === 0) return null
  return (
    <PromptDetails>
      <PromptCode>{JSON.stringify(input, null, 2)}</PromptCode>
    </PromptDetails>
  )
}

/** The question and the input, worded per tool as in the VS Code extension. */
function RequestBody({ request }: { request: ApprovalRequest }) {
  const { toolName, input } = request
  if (toolName === 'Bash' || toolName === 'PowerShell') {
    return (
      <>
        <PromptCode>{text(input.command)}</PromptCode>
        {text(input.description) && <PromptNote>{text(input.description)}</PromptNote>}
      </>
    )
  }
  if (toolName === 'WebFetch') return <PromptCode>{text(input.url)}</PromptCode>
  if (toolName === PLAN_TOOL) return <Markdown text={text(input.plan)} />
  return <InputDetails input={input} />
}

function requestTitle({ toolName, input }: ApprovalRequest): ReactNode {
  switch (toolName) {
    case 'Bash':
      return 'Allow this bash command?'
    case 'PowerShell':
      return 'Allow this PowerShell command?'
    case 'Edit':
      return <>Make this edit to <PromptPath>{fileName(input)}</PromptPath>?</>
    case 'Write':
      return <>Allow write to <PromptPath>{fileName(input)}</PromptPath>?</>
    case 'Read':
      return <>Allow reading from <PromptPath>{fileName(input)}</PromptPath>?</>
    case 'WebFetch':
      return 'Allow fetching this url?'
    case 'Glob':
      return text(input.path) ? <>Allow glob search in <PromptPath>{text(input.path)}</PromptPath>?</> : 'Allow this glob command'
    case 'Grep':
      return text(input.path) ? <>Allow grep in <PromptPath>{text(input.path)}</PromptPath>?</> : 'Allow this grep command'
    case PLAN_TOOL:
      return 'Accept this plan?'
    default:
      return <>Do you want to proceed with <strong>{toolName}</strong>?</>
  }
}

function AlwaysAllowText({ parts, destination, onCycle }: { parts: LabelPart[]; destination: PermissionDestination; onCycle: () => void }) {
  return (
    <>
      {parts.map((part, i) => {
        if ('text' in part) return <span key={i}>{part.text}</span>
        if ('grant' in part)
          return (
            <span key={i} title={part.grant.full !== part.grant.label ? part.grant.full : undefined}>
              {part.grant.label}
            </span>
          )
        if ('more' in part) return <span key={i} title={part.title}>{part.more} more</span>
        if ('directories' in part) return <span key={i} title={part.title}>{part.directories} directories</span>
        return (
          <ChoiceLink key={i} tooltip={DESTINATION_HINT[destination]} onClick={onCycle}>
            {DESTINATION_LABEL[destination]}
          </ChoiceLink>
        )
      })}
    </>
  )
}

interface Props {
  request: ApprovalRequest
  autoAvailable: boolean
  /** Switches the running session's mode without making it the default; false when the CLI refused. */
  onSetMode: (mode: PermissionMode) => Promise<boolean>
}

export function ApprovalPrompt({ request, autoAvailable, onSetMode }: Props) {
  const isPlan = request.toolName === PLAN_TOOL
  const label = isPlan ? null : alwaysAllowLabel(request.suggestions)
  const hasSecond = isPlan || label !== null
  const [destination, setDestination] = useState<PermissionDestination>(() =>
    initialDestination(request.suggestions, rememberedDestination())
  )
  const [feedback, setFeedback] = useState('')
  const rootRef = useRef<HTMLDivElement | null>(null)
  const yesRef = useRef<HTMLButtonElement | null>(null)
  const secondRef = useRef<HTMLButtonElement | null>(null)
  const noRef = useRef<HTMLButtonElement | null>(null)
  const fieldRef = useRef<HTMLInputElement | null>(null)
  const answered = useRef(false)
  const plan = planYes(autoAvailable)

  useEffect(() => {
    const pane = rootRef.current?.closest('[data-chat-pane]')
    const active = document.activeElement
    if (!active || active === document.body || pane?.contains(active)) yesRef.current?.focus()
  }, [])

  const reply = (payload: ApprovalReply): void => {
    if (answered.current) return
    answered.current = true
    window.api.approval.respond(request.requestId, payload)
    useApprovalsStore.getState().remove(request.requestId)
  }

  const yes = async (): Promise<void> => {
    if (isPlan) {
      if (!(await onSetMode(plan.mode)) && plan.mode === 'auto') await onSetMode('acceptEdits')
    }
    reply(allowReply(request.input))
  }
  const second = (): void => {
    if (isPlan) reply(planManualReply(request.input))
    else reply(alwaysAllowReply(request.input, request.suggestions, destination))
  }
  const no = (): void => reply(isPlan ? planDenyReply(feedback) : denyReply(feedback))

  const cycle = (step: 1 | -1): void => {
    const next = nextDestination(destination, step)
    rememberDestination(next)
    setDestination(next)
  }

  const choices: Array<() => void> = [() => void yes(), ...(hasSecond ? [second] : []), no, () => fieldRef.current?.focus()]
  const buttons = [yesRef, ...(hasSecond ? [secondRef] : []), noRef, fieldRef]

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>): void => {
    if (e.metaKey || e.ctrlKey || e.altKey) return
    const inField = e.target === fieldRef.current
    if (e.key === 'Escape') {
      e.preventDefault()
      no()
      return
    }
    if (inField) {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        no()
      }
      return
    }
    const pick = e.key === '4' ? choices[choices.length - 1] : choices[Number(e.key) - 1]
    if (/^[1-4]$/.test(e.key) && pick) {
      e.preventDefault()
      pick()
      return
    }
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      const at = buttons.findIndex((b) => b.current === document.activeElement)
      const next = (at + (e.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length
      buttons[next].current?.focus()
    }
  }

  const onSecondKey = (e: KeyboardEvent<HTMLButtonElement>): void => {
    if (isPlan || (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight')) return
    if (!label?.some((p) => 'destination' in p)) return
    e.preventDefault()
    cycle(e.key === 'ArrowRight' ? 1 : -1)
  }

  return (
    <ChoicePrompt ref={rootRef} label={`Approve ${request.toolName}`} title={requestTitle(request)} hint="Esc to cancel" onKeyDown={onKeyDown}>
      <RequestBody request={request} />
      {request.reason && <PromptNote>{request.reason}</PromptNote>}
      <ChoiceList>
        <ChoiceButton ref={yesRef} shortcut="1" primary onClick={() => void yes()}>
          {isPlan ? plan.label : 'Yes'}
        </ChoiceButton>
        {hasSecond && (
          <ChoiceButton ref={secondRef} shortcut="2" onClick={second} onKeyDown={onSecondKey}>
            {isPlan ? (
              'Yes, and manually approve edits'
            ) : (
              <AlwaysAllowText parts={label ?? []} destination={destination} onCycle={() => cycle(1)} />
            )}
          </ChoiceButton>
        )}
        <ChoiceButton ref={noRef} shortcut={hasSecond ? '3' : '2'} onClick={no}>
          {isPlan ? 'No, keep planning' : 'No'}
        </ChoiceButton>
        <ChoiceField ref={fieldRef} placeholder="Tell Claude what to do instead" value={feedback} onChange={setFeedback} />
      </ChoiceList>
    </ChoicePrompt>
  )
}
