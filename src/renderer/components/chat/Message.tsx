import { Markdown } from '../ui/Markdown'
import type { ContentBlock } from '../../../shared/types'
import type { ChatItem, ToolResultItem, ResultItem } from './types'
import { computeUnifiedDiff, trimContext, type DiffSegment } from './diff'
import { UnifiedDiffView, isUnifiedDiff } from './UnifiedDiffView'
import { DiffLines } from './DiffLines'
import { ToolCallRow, ToolCallSection, ToolCallText, type ToolCallStatus } from './ToolCallRow'
import { toolCallTitle } from './toolCall'
import { useToolContext } from './toolContext'

export function Message({ item }: { item: ChatItem }) {
  switch (item.kind) {
    case 'user':
      return <UserPrompt text={item.text} />
    case 'assistant':
      return <AssistantMessage content={item.content} />
    case 'tool_result':
      return <LooseToolResult item={item} />
    case 'result':
      return <TurnFooter item={item} />
    case 'system':
      return <SystemNote text={item.text} />
  }
}

/** `queued` is a prompt still waiting on the CLI; it looks the same, as in the extension, and only reads differently. */
export function UserPrompt({ text, queued = false }: { text: string; queued?: boolean }) {
  return (
    <div
      role={queued ? 'article' : undefined}
      aria-label={queued ? 'You, queued' : undefined}
      data-queued={queued || undefined}
      className="whitespace-pre-wrap break-words rounded-md border border-strong bg-input px-3 py-2 text-[13px] leading-relaxed text-fg"
    >
      {text}
    </div>
  )
}

function AssistantMessage({ content }: { content: ContentBlock[] }) {
  if (content.length === 0) return null
  return (
    <div className="space-y-2">
      {content.map((block, i) => (
        <ContentBlockView key={i} block={block} />
      ))}
    </div>
  )
}

function ContentBlockView({ block }: { block: ContentBlock }) {
  if (block.type === 'text') return <Markdown text={(block as { text: string }).text} />
  if (block.type === 'tool_use') return <ToolCall block={block as ToolUse} />
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
  const { pairs, cwd } = useToolContext()
  const result = pairs.resultFor.get(block.id)
  const { name, target } = toolCallTitle(block.name, block.input, cwd)
  const status = statusOf(result)

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
