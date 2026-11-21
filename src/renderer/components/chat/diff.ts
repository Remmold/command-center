import { diffLines } from 'diff'

export interface DiffSegment {
  kind: 'add' | 'remove' | 'context'
  text: string
}

export function computeUnifiedDiff(oldStr: string, newStr: string): DiffSegment[] {
  const changes = diffLines(oldStr, newStr)
  const segments: DiffSegment[] = []
  for (const change of changes) {
    if (change.added) segments.push({ kind: 'add', text: change.value })
    else if (change.removed) segments.push({ kind: 'remove', text: change.value })
    else segments.push({ kind: 'context', text: change.value })
  }
  return segments
}

/**
 * Trim long unchanged context blocks to keep diffs scannable.
 * Keep up to N lines at the boundary of each context block.
 */
export function trimContext(segments: DiffSegment[], contextLines = 2): DiffSegment[] {
  const out: DiffSegment[] = []
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i]
    if (seg.kind !== 'context') {
      out.push(seg)
      continue
    }
    const lines = seg.text.split('\n')
    // Strip trailing empty string from final newline split
    if (lines[lines.length - 1] === '') lines.pop()
    const isFirst = i === 0
    const isLast = i === segments.length - 1

    if (lines.length <= contextLines * 2 + 1) {
      out.push(seg)
      continue
    }
    const head = isFirst ? [] : lines.slice(0, contextLines)
    const tail = isLast ? [] : lines.slice(-contextLines)
    const hiddenCount = lines.length - head.length - tail.length
    if (head.length > 0) out.push({ kind: 'context', text: head.join('\n') + '\n' })
    if (hiddenCount > 0) {
      out.push({ kind: 'context', text: `… ${hiddenCount} unchanged line${hiddenCount === 1 ? '' : 's'} …\n` })
    }
    if (tail.length > 0) out.push({ kind: 'context', text: tail.join('\n') + '\n' })
  }
  return out
}

export function shortPath(p: string): string {
  // C:\projects\personal\foo\src\main\index.ts -> foo/src/main/index.ts
  const parts = p.split(/[\\/]/).filter(Boolean)
  if (parts.length <= 3) return parts.join('/')
  return '…/' + parts.slice(-3).join('/')
}
