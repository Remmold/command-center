import { useState } from 'react'
import { Markdown } from '../ui/Markdown'
import {
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock,
  CircleDollarSign,
  CodeXml,
  FileEdit,
  FilePlus,
  FileSearch,
  Globe,
  HardDriveDownload,
  Hash,
  Notebook,
  Search,
  Terminal as TerminalIcon,
  Wrench,
  type LucideIcon
} from 'lucide-react'
import type { ContentBlock } from '../../../shared/types'
import type { ChatItem, ToolResultItem, ResultItem } from './types'
import { computeUnifiedDiff, shortPath, trimContext } from './diff'
import { UnifiedDiffView, isUnifiedDiff } from './UnifiedDiffView'

interface MessageProps {
  item: ChatItem
}

export function Message({ item }: MessageProps) {
  switch (item.kind) {
    case 'user':
      return <UserBubble text={item.text} />
    case 'assistant':
      return <AssistantBubble content={item.content} />
    case 'tool_result':
      return <ToolResultBubble item={item} />
    case 'result':
      return <ResultFooter item={item} />
    case 'system':
      return <SystemNote text={item.text} />
  }
}

function UserBubble({ text }: { text: string }) {
  return (
    <div className="flex justify-end">
      <div className="max-w-[80%] whitespace-pre-wrap rounded-2xl rounded-br-md bg-zinc-700/90 px-4 py-2.5 text-[13px] leading-relaxed text-zinc-50">
        {text}
      </div>
    </div>
  )
}

function AssistantBubble({ content }: { content: ContentBlock[] }) {
  if (content.length === 0) return null
  return (
    <div className="space-y-3">
      {content.map((block, i) => (
        <ContentBlockView key={i} block={block} />
      ))}
    </div>
  )
}

function ContentBlockView({ block }: { block: ContentBlock }) {
  if (block.type === 'text') {
    return <Markdown text={(block as { text: string }).text} />
  }
  if (block.type === 'tool_use') {
    return <ToolUseCard block={block as { name: string; input: unknown; id: string }} />
  }
  return null
}

// ---------- Tool use cards ----------

interface ToolMeta {
  Icon: LucideIcon
  accent: string // tailwind border-* class for the left rail
  iconColor: string
  label: string
}

const TOOL_META: Record<string, ToolMeta> = {
  Bash: { Icon: TerminalIcon, accent: 'border-emerald-500/60', iconColor: 'text-emerald-400', label: 'Run command' },
  Edit: { Icon: FileEdit, accent: 'border-amber-500/60', iconColor: 'text-amber-400', label: 'Edit file' },
  Write: { Icon: FilePlus, accent: 'border-amber-500/60', iconColor: 'text-amber-400', label: 'Write file' },
  Read: { Icon: FileSearch, accent: 'border-blue-500/60', iconColor: 'text-blue-400', label: 'Read file' },
  Glob: { Icon: Hash, accent: 'border-blue-500/60', iconColor: 'text-blue-400', label: 'Find files' },
  Grep: { Icon: Search, accent: 'border-blue-500/60', iconColor: 'text-blue-400', label: 'Search text' },
  WebFetch: { Icon: Globe, accent: 'border-cyan-500/60', iconColor: 'text-cyan-400', label: 'Fetch URL' },
  WebSearch: { Icon: Globe, accent: 'border-cyan-500/60', iconColor: 'text-cyan-400', label: 'Web search' },
  NotebookEdit: { Icon: Notebook, accent: 'border-amber-500/60', iconColor: 'text-amber-400', label: 'Edit notebook' }
}

function toolMeta(name: string): ToolMeta {
  return (
    TOOL_META[name] ?? {
      Icon: Wrench,
      accent: 'border-zinc-600/60',
      iconColor: 'text-zinc-400',
      label: name
    }
  )
}

function ToolUseCard({ block }: { block: { name: string; input: unknown; id: string } }) {
  if (block.name === 'Edit' && isEditInput(block.input)) {
    return <EditDiffCard input={block.input} />
  }
  if (block.name === 'Write' && isWriteInput(block.input)) {
    return <WriteFileCard input={block.input} />
  }
  return <GenericToolUseCard block={block} />
}

function GenericToolUseCard({ block }: { block: { name: string; input: unknown; id: string } }) {
  const [open, setOpen] = useState(false)
  const meta = toolMeta(block.name)
  const summary = summarizeToolInput(block.name, block.input)
  return (
    <div
      className={`rounded-md border-l-2 ${meta.accent} border-y border-r border-zinc-800 bg-zinc-900/40`}
    >
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-start gap-2.5 px-3.5 py-2.5 text-left transition-colors hover:bg-zinc-900/70"
      >
        <meta.Icon size={15} strokeWidth={1.75} className={`mt-0.5 shrink-0 ${meta.iconColor}`} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 text-[12px]">
            <span className="font-medium text-zinc-200">{meta.label}</span>
            <span className="text-[10px] text-zinc-500">{block.name}</span>
          </div>
          {summary && (
            <div className="mt-0.5 truncate font-mono text-[11.5px] text-zinc-400">{summary}</div>
          )}
        </div>
        <span className="mt-0.5 shrink-0 text-zinc-600">
          {open ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
        </span>
      </button>
      {open && (
        <pre className="overflow-x-auto border-t border-zinc-800 bg-black/40 px-4 py-2.5 text-[11px] text-zinc-300">
          {JSON.stringify(block.input, null, 2)}
        </pre>
      )}
    </div>
  )
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
  return (
    typeof o.file_path === 'string' &&
    typeof o.old_string === 'string' &&
    typeof o.new_string === 'string'
  )
}

function isWriteInput(input: unknown): input is WriteInput {
  if (!input || typeof input !== 'object') return false
  const o = input as Record<string, unknown>
  return typeof o.file_path === 'string' && typeof o.content === 'string'
}

function EditDiffCard({ input }: { input: EditInput }) {
  const [open, setOpen] = useState(true)
  const segments = trimContext(computeUnifiedDiff(input.old_string, input.new_string))
  const adds = segments.reduce(
    (n, s) => n + (s.kind === 'add' ? countLines(s.text) : 0),
    0
  )
  const dels = segments.reduce(
    (n, s) => n + (s.kind === 'remove' ? countLines(s.text) : 0),
    0
  )
  return (
    <div className="rounded-md border-l-2 border-amber-500/60 border-y border-r border-zinc-800 bg-zinc-900/40">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left transition-colors hover:bg-zinc-900/70"
      >
        <FileEdit size={15} strokeWidth={1.75} className="shrink-0 text-amber-400" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 text-[12px]">
            <span className="font-medium text-zinc-200">Edit</span>
            <span className="truncate font-mono text-[11.5px] text-zinc-400">
              {shortPath(input.file_path)}
            </span>
            {input.replace_all && (
              <span className="rounded bg-zinc-800 px-1.5 py-0.5 text-[10px] text-zinc-400">
                replace_all
              </span>
            )}
          </div>
        </div>
        <span className="shrink-0 text-[11px]">
          <span className="text-emerald-400">+{adds}</span>
          <span className="text-zinc-600 mx-1">/</span>
          <span className="text-red-400">-{dels}</span>
        </span>
        <span className="shrink-0 text-zinc-600">
          {open ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
        </span>
      </button>
      {open && (
        <div className="border-t border-zinc-800 bg-black/50">
          <DiffView segments={segments} />
        </div>
      )}
    </div>
  )
}

function WriteFileCard({ input }: { input: WriteInput }) {
  const [open, setOpen] = useState(false)
  const lineCount = countLines(input.content)
  return (
    <div className="rounded-md border-l-2 border-amber-500/60 border-y border-r border-zinc-800 bg-zinc-900/40">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left transition-colors hover:bg-zinc-900/70"
      >
        <FilePlus size={15} strokeWidth={1.75} className="shrink-0 text-amber-400" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 text-[12px]">
            <span className="font-medium text-zinc-200">Write</span>
            <span className="truncate font-mono text-[11.5px] text-zinc-400">
              {shortPath(input.file_path)}
            </span>
          </div>
        </div>
        <span className="shrink-0 text-[11px] text-emerald-400">+{lineCount}</span>
        <span className="shrink-0 text-zinc-600">
          {open ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
        </span>
      </button>
      {open && (
        <pre className="overflow-x-auto border-t border-zinc-800 bg-black/50 px-4 py-3 text-[11.5px] text-zinc-200">
          {input.content}
        </pre>
      )}
    </div>
  )
}

function DiffView({
  segments
}: {
  segments: { kind: 'add' | 'remove' | 'context'; text: string }[]
}) {
  return (
    <div className="overflow-x-auto font-mono text-[11.5px] leading-relaxed">
      {segments.map((seg, i) => {
        const lines = seg.text.split('\n')
        if (lines[lines.length - 1] === '') lines.pop()
        const bg =
          seg.kind === 'add'
            ? 'bg-emerald-950/40'
            : seg.kind === 'remove'
              ? 'bg-red-950/40'
              : ''
        const prefix = seg.kind === 'add' ? '+' : seg.kind === 'remove' ? '-' : ' '
        const textColor =
          seg.kind === 'add'
            ? 'text-emerald-300'
            : seg.kind === 'remove'
              ? 'text-red-300'
              : 'text-zinc-400'
        return (
          <div key={i} className={bg}>
            {lines.map((line, j) => (
              <div key={j} className={`flex ${textColor}`}>
                <span className="w-5 shrink-0 select-none text-zinc-600">{prefix}</span>
                <span className="whitespace-pre">{line}</span>
              </div>
            ))}
          </div>
        )
      })}
    </div>
  )
}

// ---------- Tool result ----------

function ToolResultBubble({ item }: { item: ToolResultItem }) {
  const text = stringifyToolResult(item.content)
  const looksLikeDiff = !item.isError && isUnifiedDiff(text)
  const [open, setOpen] = useState(looksLikeDiff)
  const preview = toolResultPreview(item.content)
  const Icon = item.isError ? AlertCircle : CheckCircle2
  const accent = item.isError ? 'border-red-500/60' : 'border-emerald-500/60'
  const iconColor = item.isError ? 'text-red-400' : 'text-emerald-400'
  const label = item.isError ? 'Tool error' : looksLikeDiff ? 'Git diff' : 'Tool result'
  return (
    <div
      className={`rounded-md border-l-2 ${accent} border-y border-r border-zinc-800 bg-zinc-900/30`}
    >
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-start gap-2.5 px-3.5 py-2 text-left transition-colors hover:bg-zinc-900/60"
      >
        <Icon size={14} strokeWidth={2} className={`mt-0.5 shrink-0 ${iconColor}`} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 text-[11px]">
            <span className={item.isError ? 'text-red-300' : 'text-emerald-300'}>{label}</span>
            <span className="truncate text-zinc-500">{preview}</span>
          </div>
        </div>
        <span className="mt-0.5 shrink-0 text-zinc-600">
          {open ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
        </span>
      </button>
      {open && (
        <div className="border-t border-zinc-800 bg-black/40">
          {looksLikeDiff ? (
            <UnifiedDiffView text={text} className="px-4 py-2.5" />
          ) : (
            <pre className="overflow-x-auto whitespace-pre-wrap px-4 py-2.5 text-[11.5px] text-zinc-300">
              {text}
            </pre>
          )}
        </div>
      )}
    </div>
  )
}

// ---------- Result footer ----------

function ResultFooter({ item }: { item: ResultItem }) {
  const cost = item.costUsd !== undefined ? `$${item.costUsd.toFixed(4)}` : null
  const dur = item.durationMs !== undefined ? `${(item.durationMs / 1000).toFixed(1)}s` : null
  return (
    <div className="flex items-center gap-3 px-2 text-[10.5px] text-zinc-500">
      <CodeXml
        size={12}
        strokeWidth={1.75}
        className={item.isError ? 'text-red-400' : 'text-zinc-500'}
      />
      <span className={item.isError ? 'text-red-400' : 'text-zinc-400'}>
        {item.isError ? 'turn error' : 'turn complete'}
      </span>
      {dur && (
        <span className="flex items-center gap-1">
          <Clock size={11} strokeWidth={1.75} /> {dur}
        </span>
      )}
      {cost && (
        <span className="flex items-center gap-1">
          <CircleDollarSign size={11} strokeWidth={1.75} /> {cost}
        </span>
      )}
      {item.numTurns !== undefined && (
        <span className="flex items-center gap-1">
          <HardDriveDownload size={11} strokeWidth={1.75} />
          {item.numTurns} turn{item.numTurns === 1 ? '' : 's'}
        </span>
      )}
    </div>
  )
}

function SystemNote({ text }: { text: string }) {
  return <div className="px-2 text-[10.5px] italic text-zinc-500">{text}</div>
}

// ---------- helpers ----------

function summarizeToolInput(name: string, input: unknown): string {
  if (!input || typeof input !== 'object') return ''
  const obj = input as Record<string, unknown>
  if (name === 'Bash' && typeof obj.command === 'string') return obj.command
  if (name === 'Read' && typeof obj.file_path === 'string') return shortPath(obj.file_path)
  if (name === 'Write' && typeof obj.file_path === 'string') return shortPath(obj.file_path)
  if (name === 'Edit' && typeof obj.file_path === 'string') return shortPath(obj.file_path)
  if (name === 'Glob' && typeof obj.pattern === 'string') return obj.pattern
  if (name === 'Grep' && typeof obj.pattern === 'string') return obj.pattern
  return ''
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
  return JSON.stringify(content, null, 2)
}

function toolResultPreview(content: unknown): string {
  const s = stringifyToolResult(content)
  const oneline = s.replace(/\s+/g, ' ').trim()
  return oneline.length > 140 ? oneline.slice(0, 140) + '…' : oneline
}

function countLines(text: string): number {
  if (!text) return 0
  return text.split('\n').filter((l) => l !== '').length
}
