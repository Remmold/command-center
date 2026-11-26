import { memo, useMemo, type ReactNode } from 'react'
import { Markdown } from '../ui/Markdown'
import type { ContentBlock } from '../../../shared/types'
import { fileBaseName } from '../../../shared/fileLinks'
import type { AssistantMessageItem, ChatItem, ToolResultItem, ResultItem, SystemItem, UserAttachment } from './types'
import { SentAttachments } from './SentAttachments'
import { userBubble } from './userAttachments'
import { computeUnifiedDiff, trimContext, type DiffSegment } from './diff'
import { UnifiedDiffView, isUnifiedDiff } from './UnifiedDiffView'
import { DiffLines } from './DiffLines'
import { ToolCallBody, ToolCallErrorLine, ToolCallRow, ToolCallSection } from './ToolCallRow'
import { toolCallTitle } from './toolCall'
import { mcpToolTitle } from './mcpTool'
import { useToolContext } from './toolContext'
import { ThinkingBlock } from './ThinkingBlock'
import { CompactLine } from './CompactLine'
import { FileLink } from './fileOpener'
import { quietStepLabel, timelineSteps } from './timelineRows'
import { errorLine, persistedOutput, readableOutput } from './toolOutput'
import { parseTodos, TODO_TOOL, type Todo } from './todos'
import { stampLabel, stampTitle } from './messageTime'
import { CopyButton } from '../ui/CopyButton'
import { TimeStamp } from '../ui/TimeStamp'
import { Checklist, type CheckState } from '../ui/Checklist'
import { TimelinePlaceProvider, TimelineRow, timelinePlace } from '../ui/Timeline'
import { AgentCall } from './AgentCall'
import { AGENT_TOOLS } from './subagents'
import { toolCallStatus } from './runningCalls'
import { BACKGROUNDABLE_TOOLS } from './runInBackground'
import { RunInBackgroundLine } from './RunInBackgroundLine'
import { AnsweredQuestions } from './QuestionCard'
import { questionOutcome } from './questionCardModel'
import { QUESTION_TOOL, parseQuestions } from '../../../shared/approval'
import { PROPOSAL_TAG } from '../../../shared/featureProposal'
import { ProposalText } from './ProposalCard'

const TODO_CHECK: Record<Todo['status'], CheckState> = { pending: 'unchecked', in_progress: 'mixed', completed: 'checked' }

interface MessageProps {
  item: ChatItem
  /** The time shown next to it; only typed prompts and settled replies with text have one. */
  stampAt?: number
  /** Set while this message streams: the index of its first block not committed yet. */
  streamingFrom?: number
  /** The CLI's running thinking-token estimate for a streaming thinking block. */
  thinkingTokens?: number
  /** Whether the timeline line runs on into the item drawn above, and the one below. */
  joinAbove?: boolean
  joinBelow?: boolean
  /** A compaction boundary's summary, written in the item after it. */
  compactSummary?: string
}

export const Message = memo(function Message({ item, stampAt, streamingFrom, thinkingTokens, joinAbove = false, joinBelow = false, compactSummary }: MessageProps) {
  switch (item.kind) {
    case 'user':
      return <UserPrompt id={item.id} {...userBubble(item)} at={stampAt} />
    case 'assistant':
      return (
        <AssistantMessage
          item={item}
          stampAt={stampAt}
          streamingFrom={streamingFrom}
          thinkingTokens={thinkingTokens}
          joinAbove={joinAbove}
          joinBelow={joinBelow}
        />
      )
    case 'tool_result':
      return (
        <TimelinePlaceProvider value={timelinePlace(joinAbove, joinBelow)}>
          <LooseToolResult item={item} />
        </TimelinePlaceProvider>
      )
    case 'result':
      return <TurnFooter item={item} />
    case 'system':
      return (
        <TimelinePlaceProvider value={timelinePlace(joinAbove, joinBelow)}>
          <SystemNote item={item} compactSummary={compactSummary} />
        </TimelinePlaceProvider>
      )
  }
})

function Stamp({ at }: { at: number }) {
  return <TimeStamp at={at} label={stampLabel(at)} title={stampTitle(at)} />
}

/** `queued` is a prompt still waiting on the CLI; it looks the same, as in the extension, and only reads differently. */
interface UserPromptProps {
  id: string
  text: string
  attachments?: readonly UserAttachment[]
  /** What an item saved before attachments were kept counted, e.g. "1 image (not kept)". */
  notKept?: string | null
  queued?: boolean
  at?: number
}

export function UserPrompt({ id, text, attachments = [], notKept = null, queued = false, at }: UserPromptProps) {
  return (
    <div className="py-1.5">
      {at !== undefined && !queued && (
        <div className="flex justify-end pb-0.5">
          <Stamp at={at} />
        </div>
      )}
      <div
        role={queued ? 'article' : undefined}
        aria-label={queued ? 'You, queued' : undefined}
        data-queued={queued || undefined}
        data-user-prompt=""
        className="whitespace-pre-wrap break-words rounded-md border border-strong bg-input px-3 py-2 text-[13px] leading-relaxed text-fg"
      >
        {text}
        <SentAttachments messageId={id} attachments={attachments} notKept={notKept} belowText={text !== ''} />
      </div>
    </div>
  )
}

const PARAGRAPH = '\n\n'

function textBlocks(content: ContentBlock[]): string[] {
  return content.flatMap((b) => (b.type === 'text' && typeof b.text === 'string' ? [b.text] : []))
}

interface AssistantProps {
  item: AssistantMessageItem
  stampAt?: number
  streamingFrom?: number
  thinkingTokens?: number
  joinAbove: boolean
  joinBelow: boolean
}

/** A reply drawn as the extension does: each thinking, text and tool block its own step on the timeline. */
function AssistantMessage({ item, stampAt, streamingFrom, thinkingTokens, joinAbove, joinBelow }: AssistantProps) {
  const { content } = item
  const steps = timelineSteps(content)
  if (steps.length === 0) return null
  const shown = steps.map((s) => s.indexes[0])
  const copyable = streamingFrom === undefined && textBlocks(content).length > 0 && !item.parentToolUseId && !item.raw.parent_tool_use_id
  const firstText = shown.find((i) => content[i].type === 'text')
  const lastText = [...shown].reverse().find((i) => content[i].type === 'text')
  return (
    <div data-assistant-message="" className="group/message">
      {steps.map(({ indexes, quiet }, n) => {
        const i = indexes[0]
        const place = timelinePlace(n > 0 || joinAbove, n < steps.length - 1 || joinBelow)
        if (quiet) {
          return (
            <TimelinePlaceProvider key={i} value={place}>
              <QuietStops blocks={indexes.map((j) => content[j] as ToolUse)} />
            </TimelinePlaceProvider>
          )
        }
        return (
          <TimelinePlaceProvider key={i} value={place}>
            <ContentBlockView
              block={content[i]}
              itemId={item.id}
              index={i}
              streaming={streamingFrom !== undefined && i >= streamingFrom}
              durationMs={item.thinkingMs?.[i]}
              thinkingTokens={thinkingTokens}
              stamp={i === firstText && stampAt !== undefined ? <Stamp at={stampAt} /> : undefined}
              footer={
                i === lastText && copyable ? (
                  <div className="flex h-5 items-center">
                    <CopyButton getText={() => textBlocks(content).join(PARAGRAPH)} label="Copy response" reveal="message" />
                  </div>
                ) : undefined
              }
            />
          </TimelinePlaceProvider>
        )
      })}
    </div>
  )
}

interface BlockProps {
  block: ContentBlock
  itemId: string
  index: number
  streaming: boolean
  durationMs: number | undefined
  thinkingTokens?: number
  stamp?: ReactNode
  footer?: ReactNode
}

function ContentBlockView({ block, itemId, index, streaming, durationMs, thinkingTokens, stamp, footer }: BlockProps) {
  const { proposals } = useToolContext()
  if (block.type === 'text') {
    const text = (block as { text: string }).text
    return (
      <TimelineRow dot="neutral" stamp={stamp}>
        {proposals && text.includes(PROPOSAL_TAG) ? <ProposalText text={text} itemId={itemId} block={index} /> : <Markdown text={text} />}
        {footer}
      </TimelineRow>
    )
  }
  if (block.type === 'tool_use') return <ToolCall block={block as ToolUse} />
  if (block.type === 'thinking') {
    const text = typeof block.thinking === 'string' ? block.thinking : ''
    return <ThinkingBlock text={text} streaming={streaming} durationMs={durationMs} tokens={streaming ? thinkingTokens : undefined} />
  }
  return null
}

interface ToolUse {
  id: string
  name: string
  input: unknown
}

interface EditInput {
  file_path: string
  old_string: string
  new_string: string
  replace_all?: boolean
}

interface WriteInput {
  file_path: string
  content: string
}

interface ReadInput {
  file_path: string
  offset?: number
  limit?: number
}

function isEditInput(input: unknown): input is EditInput {
  if (!input || typeof input !== 'object') return false
  const o = input as Record<string, unknown>
  return typeof o.file_path === 'string' && typeof o.old_string === 'string' && typeof o.new_string === 'string'
}

function isWriteInput(input: unknown): input is WriteInput {
  if (!input || typeof input !== 'object') return false
  const o = input as Record<string, unknown>
  return typeof o.file_path === 'string' && typeof o.content === 'string'
}

function isReadInput(input: unknown): input is ReadInput {
  return !!input && typeof input === 'object' && typeof (input as Record<string, unknown>).file_path === 'string'
}

/** Tools whose header already says what they did; the extension shows only their output (or only an error). */
const OUTPUT_ONLY: ReadonlySet<string> = new Set(['Glob', 'Grep', 'WebFetch', 'WebSearch'])
const ERROR_ONLY: ReadonlySet<string> = new Set(['Skill'])

/** The extension's `(lines a-b)` / `(from line a)` after a Read's file name. */
function readRange(input: ReadInput): string {
  const start = input.offset ?? 1
  if (input.offset !== undefined && input.limit !== undefined) return ` (lines ${start}-${start + input.limit - 1})`
  if (input.offset !== undefined) return ` (from line ${start})`
  return ''
}

function FileTarget({ path, suffix = '' }: { path: string; suffix?: string }) {
  return (
    <>
      <FileLink path={path}>{fileBaseName(path)}</FileLink>
      {suffix}
    </>
  )
}

/** A failed call's first line, which shows while its body is folded. */
function useErrorText(result: ToolResultItem | undefined): string | undefined {
  const failed = result?.isError === true
  const content = result?.content
  return useMemo(() => (failed ? errorLine(stringifyToolResult(content)) || undefined : undefined), [failed, content])
}

function ToolCall({ block }: { block: ToolUse }) {
  const { pairs, cwd, latestTodoId, running } = useToolContext()
  const result = pairs.resultFor.get(block.id)
  const { name, target, prose } = toolCallTitle(block.name, block.input, cwd)
  const status = toolCallStatus(result, running.has(block.id))
  const error = useErrorText(result)

  if (AGENT_TOOLS.has(block.name)) {
    return <AgentCall id={block.id} name={block.name} input={block.input} result={result} resultText={result ? stringifyToolResult(result.content) : ''} />
  }

  const mcp = mcpToolTitle(block.name, block.input)
  if (mcp) {
    return (
      <ToolCallRow name={`${mcp.server} [${mcp.tool}]`} target={mcp.detail ?? ''} status={status} error={error}>
        {result ? (
          <ToolCallBody>
            <ResultSection result={result} />
          </ToolCallBody>
        ) : undefined}
      </ToolCallRow>
    )
  }

  if (block.name === QUESTION_TOOL) return <QuestionCall block={block} result={result} status={status} />

  const todos = block.name === TODO_TOOL ? parseTodos(block.input) : undefined
  if (todos) {
    const current = block.id === latestTodoId
    return (
      <ToolCallRow key={current ? 'current' : 'earlier'} name="Update Todos" target="" status={status} defaultOpen={current} error={error}>
        <Checklist entries={todos.map((t) => ({ label: t.content, state: TODO_CHECK[t.status] }))} />
        {result?.isError && (
          <ToolCallBody>
            <ResultSection result={result} />
          </ToolCallBody>
        )}
      </ToolCallRow>
    )
  }

  if (block.name === 'Read' && isReadInput(block.input)) {
    return (
      <ToolCallRow name="Read" target={<FileTarget path={block.input.file_path} suffix={readRange(block.input)} />} status={status} error={error}>
        {result?.isError ? (
          <ToolCallBody>
            <ResultSection result={result} />
          </ToolCallBody>
        ) : undefined}
      </ToolCallRow>
    )
  }

  if (block.name === 'Edit' && isEditInput(block.input)) {
    const segments = trimContext(computeUnifiedDiff(block.input.old_string, block.input.new_string))
    return (
      <ToolCallRow
        name={name}
        target={<FileTarget path={block.input.file_path} />}
        status={status}
        meta={<DiffCounts adds={countSegmentLines(segments, 'add')} dels={countSegmentLines(segments, 'remove')} replaceAll={block.input.replace_all} />}
        defaultOpen={!result?.isError}
        error={error}
      >
        <ToolCallBody>
          <ToolCallSection label="diff">
            <DiffLines segments={segments} />
          </ToolCallSection>
          {result?.isError && <ResultSection result={result} />}
        </ToolCallBody>
      </ToolCallRow>
    )
  }

  if (block.name === 'Write' && isWriteInput(block.input)) {
    return (
      <ToolCallRow
        name={name}
        target={<FileTarget path={block.input.file_path} />}
        status={status}
        meta={<DiffCounts adds={countLines(block.input.content)} />}
        defaultOpen={!result?.isError}
        error={error}
      >
        <ToolCallBody>
          <ToolCallSection label="in" text={block.input.content} />
          {result && <ResultSection result={result} />}
        </ToolCallBody>
      </ToolCallRow>
    )
  }

  const showsInput = !OUTPUT_ONLY.has(block.name) && !ERROR_ONLY.has(block.name)
  const showsResult = !!result && (!ERROR_ONLY.has(block.name) || result.isError)
  const movable = !result && BACKGROUNDABLE_TOOLS.has(block.name)
  return (
    <ToolCallRow
      name={name}
      target={target}
      prose={prose}
      status={status}
      error={error}
      note={movable ? <RunInBackgroundLine toolUseId={block.id} /> : undefined}
    >
      {showsInput || showsResult ? (
        <ToolCallBody>
          {showsInput && <ToolCallSection label="in" text={inputText(block.input)} />}
          {showsResult && result && <ResultSection result={result} />}
        </ToolCallBody>
      ) : undefined}
    </ToolCallRow>
  )
}

/** Background-task stops side by side as one quiet line, e.g. "Stopped 2 background tasks"; a failed stop still shows its error. */
function QuietStops({ blocks }: { blocks: ToolUse[] }) {
  const { pairs, running } = useToolContext()
  const results = blocks.map((b) => pairs.resultFor.get(b.id))
  const statuses = blocks.map((b, n) => toolCallStatus(results[n], running.has(b.id)))
  const status = statuses.find((s) => s === 'error') ?? statuses.find((s) => s === 'running' || s === 'pending') ?? statuses[0]
  const failed = results.filter((r): r is ToolResultItem => r?.isError === true)
  return (
    <ToolCallRow
      name={quietStepLabel(blocks.length)}
      target=""
      status={status}
      quiet
      note={failed.map((r) => (
        <ToolCallErrorLine key={r.toolUseId} text={errorLine(stringifyToolResult(r.content))} />
      ))}
    />
  )
}

/** "Question(s)" with the extension's status line ("Answered · 2 questions") and the answered card; the result box when it reads as neither. */
function QuestionCall({ block, result, status }: { block: ToolUse; result: ToolResultItem | undefined; status: ReturnType<typeof toolCallStatus> }) {
  const questions = parseQuestions(block.input && typeof block.input === 'object' ? (block.input as Record<string, unknown>) : {})
  const name = questions.length === 1 ? 'Question' : 'Questions'
  const outcome = result ? questionOutcome(questions, stringifyToolResult(result.content), result.isError === true) : null
  const count = questions.length > 0 ? ` · ${questions.length} ${questions.length === 1 ? 'question' : 'questions'}` : ''
  const error = useErrorText(result)
  return (
    <ToolCallRow name={name} target={outcome ? `${outcome.status}${count}` : ''} status={status} defaultOpen={outcome?.status === 'Answered'} error={outcome ? undefined : error}>
      {outcome?.status === 'Answered' ? (
        <AnsweredQuestions questions={questions} answers={outcome.answers} />
      ) : result && !outcome ? (
        <ToolCallBody>
          <ResultSection result={result} />
        </ToolCallBody>
      ) : undefined}
    </ToolCallRow>
  )
}

function ResultSection({ result }: { result: ToolResultItem }) {
  const text = useMemo(() => stringifyToolResult(result.content), [result.content])
  const shown = useMemo(() => {
    const saved = persistedOutput(text)
    if (saved) return { text: saved.preview, raw: undefined, saved }
    return { ...readableOutput(text), saved: null }
  }, [text])
  if (!result.isError && isUnifiedDiff(text)) {
    return (
      <ToolCallSection label="out">
        <UnifiedDiffView text={text} className="py-1" />
      </ToolCallSection>
    )
  }
  const lead = shown.saved ? <FileLink path={shown.saved.path}>{shown.saved.label}</FileLink> : undefined
  return <ToolCallSection label="out" tone={result.isError ? 'error' : 'normal'} text={shown.text || (lead ? '' : '(no output)')} raw={shown.raw} lead={lead} />
}

/** A result whose call is not in the chat, e.g. cut off by a shortened transcript. */
function LooseToolResult({ item }: { item: ToolResultItem }) {
  const target = useMemo(() => {
    const text = stringifyToolResult(item.content)
    const saved = persistedOutput(text)
    if (saved) return saved.label
    const readable = readableOutput(text)
    // JSON without a readable field stays out of the header; its OUT box shows it.
    return readable.raw !== undefined && readable.text === text ? '' : oneLine(readable.text)
  }, [item.content])
  const error = useErrorText(item)
  return (
    <ToolCallRow name="Result" target={target} status={toolCallStatus(item, false)} error={error}>
      <ToolCallBody>
        <ResultSection result={item} />
      </ToolCallBody>
    </ToolCallRow>
  )
}

function DiffCounts({ adds, dels, replaceAll }: { adds: number; dels?: number; replaceAll?: boolean }) {
  return (
    <span className="flex items-center gap-1.5 font-mono text-[11px]">
      {replaceAll && <span className="text-faint">replace all</span>}
      <span className="text-success">+{adds}</span>
      {dels !== undefined && <span className="text-error">-{dels}</span>}
    </span>
  )
}

function TurnFooter({ item }: { item: ResultItem }) {
  const parts = [item.isError ? 'turn error' : 'turn complete']
  if (item.durationMs !== undefined) parts.push(`${(item.durationMs / 1000).toFixed(1)}s`)
  if (item.numTurns !== undefined) parts.push(`${item.numTurns} turn${item.numTurns === 1 ? '' : 's'}`)
  return <div className={`px-1.5 py-1.5 text-[11px] ${item.isError ? 'text-error' : 'text-faint'}`}>{parts.join(' · ')}</div>
}

function SystemNote({ item, compactSummary }: { item: SystemItem; compactSummary?: string }) {
  if (item.compact || item.compactSummary !== undefined) {
    return <CompactLine meta={item.compact} summary={compactSummary ?? item.compactSummary} />
  }
  return <div className="px-1.5 py-1.5 text-[11px] text-faint">{item.text}</div>
}

function inputText(input: unknown): string {
  if (input && typeof input === 'object') {
    const command = (input as Record<string, unknown>).command
    if (typeof command === 'string') return command
  }
  return JSON.stringify(input, null, 2) ?? ''
}

function stringifyToolResult(content: unknown): string {
  if (typeof content === 'string') return content
  if (Array.isArray(content)) {
    return content
      .map((c) => {
        if (c && typeof c === 'object' && 'text' in c) return String((c as { text: unknown }).text)
        return JSON.stringify(c)
      })
      .join('\n')
  }
  return JSON.stringify(content, null, 2) ?? ''
}

function oneLine(text: string): string {
  const s = text.replace(/\s+/g, ' ').trim()
  return s.length > 140 ? s.slice(0, 140) + '…' : s
}

function countSegmentLines(segments: DiffSegment[], kind: 'add' | 'remove'): number {
  return segments.reduce((n, s) => n + (s.kind === kind ? countLines(s.text) : 0), 0)
}

function countLines(text: string): number {
  if (!text) return 0
  return text.split('\n').filter((l) => l !== '').length
}
