import { useMemo, useState } from 'react'

interface Props {
  text: string
  className?: string
  /** Hard cap on lines rendered before showing a "show all" button. Default 1500. */
  maxLines?: number
}

const DEFAULT_MAX = 800

export function isUnifiedDiff(text: string): boolean {
  if (!text || typeof text !== 'string') return false
  const hasHunk = /^@@ .+? @@/m.test(text)
  const hasFile = /^diff --git /m.test(text) || /^\+\+\+ /m.test(text)
  return hasHunk && hasFile
}

function classifyLine(line: string): { row: string; bg: string } {
  if (line.startsWith('diff --git ') || line.startsWith('index ')) {
    return { row: 'text-muted', bg: '' }
  }
  if (line.startsWith('--- ') || line.startsWith('+++ ')) {
    return { row: 'text-fg font-semibold', bg: '' }
  }
  if (line.startsWith('@@')) {
    return { row: 'text-sky-400', bg: 'bg-sidebar/40' }
  }
  if (line.startsWith('+')) {
    return { row: 'text-emerald-300', bg: 'bg-emerald-950/40' }
  }
  if (line.startsWith('-')) {
    return { row: 'text-red-300', bg: 'bg-red-950/40' }
  }
  return { row: 'text-muted', bg: '' }
}

export function UnifiedDiffView({ text, className, maxLines = DEFAULT_MAX }: Props) {
  const allLines = useMemo(() => {
    const lines = text.split('\n')
    if (lines.length > 0 && lines[lines.length - 1] === '') lines.pop()
    return lines
  }, [text])

  const [expanded, setExpanded] = useState(false)
  const truncated = allLines.length > maxLines && !expanded
  const visibleLines = truncated ? allLines.slice(0, maxLines) : allLines

  return (
    <div
      className={
        'overflow-x-auto font-mono text-[11.5px] leading-relaxed ' + (className ?? '')
      }
    >
      {visibleLines.map((line, i) => {
        const c = classifyLine(line)
        return (
          <div key={i} className={`${c.row} ${c.bg}`}>
            <span className="whitespace-pre">{line || ' '}</span>
          </div>
        )
      })}
      {truncated && (
        <div className="sticky bottom-0 mt-1 flex items-center justify-between border-t border-subtle bg-editor/95 px-3 py-1.5 text-[11px] text-muted backdrop-blur">
          <span>
            Diff truncated at {maxLines} lines —{' '}
            <span className="text-fg">{allLines.length - maxLines}</span> more hidden
          </span>
          <button
            onClick={() => setExpanded(true)}
            className="rounded bg-list-selected px-2 py-0.5 text-fg hover:bg-strong"
          >
            show all
          </button>
        </div>
      )}
    </div>
  )
}
