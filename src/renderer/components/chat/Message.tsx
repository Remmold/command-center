import { Markdown } from '../ui/Markdown'
import type { ContentBlock } from '../../../shared/types'
import type { AssistantMessageItem, ChatItem, ToolResultItem, ResultItem } from './types'
import { computeUnifiedDiff, trimContext, type DiffSegment } from './diff'
import { UnifiedDiffView, isUnifiedDiff } from './UnifiedDiffView'
import { DiffLines } from './DiffLines'
import { ToolCallRow, ToolCallSection, ToolCallText, type ToolCallStatus } from './ToolCallRow'
import { toolCallTitle } from './toolCall'
import { useToolContext } from './toolContext'
import { ThinkingBlock } from './ThinkingBlock'
import { parseTodos, TODO_TOOL, type Todo } from './todos'
import { stampLabel, stampTitle } from './messageTime'
import { CopyButton } from '../ui/CopyButton'
import { TimeStamp } from '../ui/TimeStamp'
import { Checklist, type CheckState } from '../ui/Checklist'

const TODO_CHECK: Record<Todo['status'], CheckState> = { pending: 'unchecked', in_progress: 'mixed', completed: 'checked' }

interface MessageProps {
  item: ChatItem
  /** The time shown next to it; only typed prompts and settled replies with text have one. */
  stampAt?: number
  /** Set while this message streams: the index of its first block not committed yet. */
  streamingFrom?: number
  /** The CLI's running thinking-token estimate for a streaming thinking block. */
  thinkingTokens?: number
}

export function Message({ item, stampAt, streamingFrom, thinkingTokens }: MessageProps) {
  switch (item.kind) {
    case 'user':
      return <UserPrompt text={item.text} at={stampAt} />
    case 'assistant':
      return <AssistantMessage item={item} stampAt={stampAt} streamingFrom={streamingFrom} thinkingTokens={thinkingTokens} />
    case 'tool_result':
      return <LooseToolResult item={item} />
    case 'result':
      return <TurnFooter item={item} />
    case 'system':
      return <SystemNote text={item.text} />
  }
}

function Stamp({ at }: { at: number }) {
  return <TimeStamp at={at} label={stampLabel(at)} title={stampTitle(at)} />
}

/** `queued` is a prompt still waiting on the CLI; it looks the same, as in the extension, and only reads differently. */
export function UserPrompt({ text, queued = false, at }: { text: string; queued?: boolean; at?: number }) {
  return (
    <div>
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
}

function AssistantMessage({ item, stampAt, streamingFrom, thinkingTokens }: AssistantProps) {
  const { content } = item
  if (content.length === 0) return null
  const copyable = streamingFrom === undefined && textBlocks(content).length > 0 && !item.raw.parent_tool_use_id
  return (
    <div data-assistant-message="" className="group/message relative space-y-2">
      {stampAt !== undefined && (
        <div className="absolute right-0 top-0">
          <Stamp at={stampAt} />
        </div>
      )}
      <div className={`space-y-2 ${stampAt !== undefined ? 'pr-16' : ''}`}>
        {content.map((block, i) => (
          <ContentBlockView
            key={i}
            block={block}
            streaming={streamingFrom !== undefined && i >= streamingFrom}
            durationMs={item.thinkingMs?.[i]}
            thinkingTokens={thinkingTokens}
          />
        ))}
      </div>
      {copyable && (
        <div className="flex h-5 items-center px-1">
          <CopyButton getText={() => textBlocks(content).join(PARAGRAPH)} label="Copy response" reveal="message" />
        </div>
      )}
    </div>
  )
}

interface BlockProps {
  block: ContentBlock
  streaming: boolean
  durationMs: number | undefined
  thinkingTokens?: number
}

function ContentBlockView({ block, streaming, durationMs, thinkingTokens }: BlockProps) {
  if (block.type === 'text') return <Markdown text={(block as { text: string }).text} />
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

function statusOf(result: ToolResultItem | undefined): ToolCallStatus {
  if (!result) return 'pending'
  return result.isError ? 'error' : 'ok'
}

function ToolCall({ block }: { block: ToolUse }) {
  const { pairs, cwd, latestTodoId } = useToolContext()
  const result = pairs.resultFor.get(block.id)
  const { name, target } = toolCallTitle(block.name, block.input, cwd)
  const status = statusOf(result)

  const todos = block.name === TODO_TOOL ? parseTodos(block.input) : undefined
  if (todos) {
    const current = block.id === latestTodoId
    return (
      <ToolCallRow key={current ? 'current' : 'earlier'} name="Update Todos" target="" status={status} defaultOpen={current}>
        <Checklist entries={todos.map((t) => ({ label: t.content, state: TODO_CHECK[t.status] }))} />
        {result?.isError && <ResultSection result={result} />}
      </ToolCallRow>
    )
  }

  if (block.name === 'Edit' && isEditInput(block.input)) {
    const segments = trimContext(computeUnifiedDiff(block.input.old_string, block.input.new_string))
    return (
      <ToolCallRow name={name} target={target} status={status} meta={<DiffCounts adds={countSegmentLines(segments, 'add')} dels={countSegmentLines(segments, 'remove')} replaceAll={block.input.replace_all} />} defaultOpen>
        <ToolCallSection label="diff">
          <DiffLines segments={segments} />
        </ToolCallSection>
        {result?.isError && <ResultSection result={result} />}
      </ToolCallRow>
    )
  }

  if (block.name === 'Write' && isWriteInput(block.input)) {
    return (
      <ToolCallRow name={name} target={target} status={status} meta={<DiffCounts adds={countLines(block.input.content)} />}>
        <ToolCallSection label="in">
          <ToolCallText>{block.input.content}</ToolCallText>
        </ToolCallSection>
        {result && <ResultSection result={result} />}
      </ToolCallRow>
    )
  }

  const resultText = result ? stringifyToolResult(result.content) : ''
  const showsDiff = !!result && !result.isError && isUnifiedDiff(resultText)
  return (
    <ToolCallRow name={name} target={target} status={status} defaultOpen={showsDiff}>
      <ToolCallSection label="in">
        <ToolCallText>{inputText(block.input)}</ToolCallText>
      </ToolCallSection>
      {result && <ResultSection result={result} />}
    </ToolCallRow>
  )
}

function ResultSection({ result }: { result: ToolResultItem }) {
  const text = stringifyToolResult(result.content)
  const tone = result.isError ? 'error' : 'normal'
  return (
    <ToolCallSection label="out" tone={tone}>
      {!result.isError && isUnifiedDiff(text) ? (
        <UnifiedDiffView text={text} className="py-1" />
      ) : (
        <ToolCallText>{text || '(no output)'}</ToolCallText>
      )}
    </ToolCallSection>
  )
}

/** A result whose call is not in the chat, e.g. cut off by a shortened transcript. */
function LooseToolResult({ item }: { item: ToolResultItem }) {
  const { pairs } = useToolContext()
  if (pairs.isPaired(item)) return null
  const text = stringifyToolResult(item.content)
  return (
    <ToolCallRow name="Result" target={oneLine(text)} status={statusOf(item)} defaultOpen={!item.isError && isUnifiedDiff(text)}>
      <ResultSection result={item} />
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
  if (item.costUsd !== undefined) parts.push(`$${item.costUsd.toFixed(4)}`)
  if (item.numTurns !== undefined) parts.push(`${item.numTurns} turn${item.numTurns === 1 ? '' : 's'}`)
  return <div className={`px-1.5 text-[11px] ${item.isError ? 'text-error' : 'text-faint'}`}>{parts.join(' · ')}</div>
}

function SystemNote({ text }: { text: string }) {
  return <div className="px-1.5 text-[11px] text-faint">{text}</div>
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
