import type { DiffSegment } from './diff'

const ROW: Record<DiffSegment['kind'], string> = {
  add: 'bg-diff-inserted',
  remove: 'bg-diff-removed',
  context: ''
}

const SIGN: Record<DiffSegment['kind'], { char: string; tone: string }> = {
  add: { char: '+', tone: 'text-success' },
  remove: { char: '-', tone: 'text-error' },
  context: { char: ' ', tone: 'text-faint' }
}

/** Line-level diff in VS Code's inserted/removed colours with a +/- gutter. */
export function DiffLines({ segments }: { segments: DiffSegment[] }) {
  return (
    <div className="overflow-x-auto py-1 font-mono text-[12px] leading-[18px] text-fg">
      {segments.flatMap((seg, i) => {
        const lines = seg.text.split('\n')
        if (lines[lines.length - 1] === '') lines.pop()
        const sign = SIGN[seg.kind]
        return lines.map((line, j) => (
          <div key={`${i}-${j}`} className={`flex min-w-max ${ROW[seg.kind]}`}>
            <span className={`w-6 shrink-0 select-none border-r border-subtle text-center ${sign.tone}`}>{sign.char}</span>
            <span className="whitespace-pre pl-2 pr-3">{line || ' '}</span>
          </div>
        ))
      })}
    </div>
  )
}
